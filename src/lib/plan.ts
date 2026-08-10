/**
 * plan.ts — マイ避難計画カードのルールエンジン（P2-W1）。
 *
 * 家族プロフィール（useProfileStore）＋判定済み地点（usePlanStore の coords/risk）から
 * 計画カードの中身を組み立てる。ネットワークは施設データのfetch（キャッシュ済み）のみで、
 * プロフィールがネットワークに乗ることはない。
 *
 * 優先順位付けの方針（phase2_spec.md P2-W1）:
 *  - 車椅子・要介護がいる世帯 → バリアフリー設備フラグが立っている避難所を優先。
 *    BFフラグは true|null（null=情報なし）のため「求める設備のうち1つ以上 true」を適合とし、
 *    適合施設を距離順で先頭に置く。比較用に無条件の最寄りも併記する。
 *  - 要配慮属性がある世帯には福祉避難所（二次避難所）の案内を添える。施設一覧は各区市が公表しており
 *    本アプリは再配布しないため、判定地点の区市の公表ページへのリンクを出す。
 *    「直接向かう場所ではなく開設後に案内される二次避難先」の注記（STRINGS.fukushi.roleNote）が必須。
 *  - けが・急病の搬送先（災害拠点病院）は世帯構成によらず全世帯に出す。
 *    軽症で自己判断して向かう場所ではない旨の注記（STRINGS.hospital.roleNote）が必須。
 */

import {
  KIT_BASIC,
  kitSectionsFor,
  type KitAttribute,
  type KitItem,
  type KitSection,
} from '../data/emergency_kit'
import {
  filterAreasByHazard,
  findFukushiLink,
  findNearestHospitals,
  loadAreas,
  loadCenters,
  nearest,
  type BarrierFree,
  type FacilityWithDistance,
  type FukushiLinkResult,
  type HospitalWithDistance,
} from './shelters'
import type { FamilyProfile } from '../store/useProfileStore'

/** プロフィール → 持ち出し品の属性キー（emergency_kit のセクション選択）。 */
export function kitAttributesFor(profile: FamilyProfile): KitAttribute[] {
  const out: KitAttribute[] = []
  if (profile.ages.infant) out.push('infant')
  if (profile.ages.senior) out.push('senior')
  if (profile.attrs.wheelchair) out.push('wheelchair')
  if (profile.attrs.visual) out.push('visual')
  if (profile.attrs.hearing) out.push('hearing')
  if (profile.attrs.dementia) out.push('dementia')
  if (profile.attrs.medical) out.push('medical')
  if (profile.attrs.pregnant) out.push('pregnant')
  if (profile.pet !== 'none') out.push('pet')
  return out
}

/** プロフィール → 生活避難先（避難所）に求めるバリアフリー設備。 */
export function requiredBarrierFree(profile: FamilyProfile): Array<keyof BarrierFree> {
  const req = new Set<keyof BarrierFree>()
  if (profile.attrs.wheelchair) {
    req.add('elevator_or_1f')
    req.add('slope')
    req.add('wheelchair_toilet')
  }
  if (profile.attrs.dementia) {
    // 要介護＝階段移動が難しい前提でエレベーター/1階受入を求める
    req.add('elevator_or_1f')
  }
  if (profile.attrs.visual) {
    req.add('braille_block')
  }
  return [...req]
}

/** 求める設備のうち true の個数。 */
export function bfMatchCount(bf: BarrierFree, required: Array<keyof BarrierFree>): number {
  return required.filter((k) => bf[k] === true).length
}

/** 生活避難先の候補（優先順で並ぶ）。 */
export interface CenterCandidate extends FacilityWithDistance {
  /** 求める設備のうち何個が公表データで true か */
  bfMatched: number
  /** BF適合として優先表示する候補か（badge表示用） */
  prioritized: boolean
}

/** 要配慮属性（福祉避難所の対象になり得る人）が世帯にいるか。 */
export function hasVulnerableMember(profile: FamilyProfile): boolean {
  const a = profile.attrs
  return (
    a.wheelchair || a.visual || a.hearing || a.dementia || a.medical || a.pregnant ||
    profile.ages.senior || profile.ages.infant
  )
}

/** マイ避難計画カードの中身。 */
export interface EvacuationPlan {
  /** 地震のとき逃げる避難場所（最寄り。データ無しは null） */
  area: FacilityWithDistance | null
  /** 生活避難先の候補（優先順・最大3件）。BF要件があるときは適合施設が先頭 */
  centers: CenterCandidate[]
  /** 求めたバリアフリー設備（空=BF要件なし。カードの説明表示用） */
  requiredBf: Array<keyof BarrierFree>
  /** 福祉避難所の案内先（要配慮メンバーがいるときのみ。いなければ／取得失敗時は null） */
  fukushi: FukushiLinkResult | null
  /** けが・急病のときの搬送先候補（災害拠点病院を優先。取得失敗時は空配列） */
  hospitals: HospitalWithDistance[]
  /** 持ち出し品チェックリスト（基本＋属性別） */
  kit: { basic: KitItem[]; sections: KitSection[] }
}

/** 生活避難先候補の最大件数。 */
const MAX_CENTERS = 3

/**
 * 計画カードを生成する。
 * @param profile 家族プロフィール
 * @param origin わが家座標
 * @param ward 判定地点の区市町村名（RiskInfo.ward）
 */
export async function buildPlan(
  profile: FamilyProfile,
  origin: { lng: number; lat: number },
  ward: string,
): Promise<EvacuationPlan> {
  const [areas, centers] = await Promise.all([loadAreas(), loadCenters()])

  // 1) 避難場所（地震対応）: 危険度カードと同じ「最寄り1件」
  const area = nearest(origin, filterAreasByHazard(areas, 'quake'), 1)[0] ?? null

  // 2) 生活避難先（避難所）: BF要件があれば適合施設を距離順で優先
  const requiredBf = requiredBarrierFree(profile)
  const byDistance = nearest(origin, centers, centers.length)
  const candidates: CenterCandidate[] = []
  if (requiredBf.length > 0) {
    for (const c of byDistance) {
      if (candidates.length >= MAX_CENTERS - 1) break
      const matched = bfMatchCount(c.bf, requiredBf)
      if (matched > 0) candidates.push({ ...c, bfMatched: matched, prioritized: true })
    }
    // 比較用に無条件の最寄りを1件併記（既にBF適合で入っていれば重複させない）
    const plain = byDistance[0]
    if (plain && !candidates.some((c) => c.name === plain.name && c.address === plain.address)) {
      candidates.push({ ...plain, bfMatched: bfMatchCount(plain.bf, requiredBf), prioritized: false })
    }
  } else {
    for (const c of byDistance.slice(0, 2)) {
      candidates.push({ ...c, bfMatched: 0, prioritized: false })
    }
  }

  // 3) 福祉避難所（二次避難所）: 要配慮メンバーがいる世帯のみ。区市の公表ページへ案内する。
  //    リンク集を取得できなくてもカード全体は出したいので null に倒す（セクションごと出さない）。
  const fukushi = hasVulnerableMember(profile)
    ? await findFukushiLink(ward).catch(() => null)
    : null

  // 4) けが・急病のときの搬送先: 災害拠点病院は世帯構成によらず必要なので無条件。
  //    データ取得に失敗してもカード全体は出したいので空配列に倒す。
  const hospitals = await findNearestHospitals(origin, 2).catch(() => [])

  // 5) 持ち出し品: 基本＋属性別
  const kit = { basic: KIT_BASIC, sections: kitSectionsFor(kitAttributesFor(profile)) }

  return { area, centers: candidates, requiredBf, fukushi, hospitals, kit }
}

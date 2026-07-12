/**
 * share.ts — マイ避難計画カードのURL共有（P2-W2）。
 *
 * 設計（phase2_spec.md §2）:
 *  - 計画データ（プロフィール＋判定地点）を lz-string で圧縮し **URLフラグメント（#p=...）** に載せる。
 *    フラグメントはサーバーに送信されない＝共有してもデータがネットワークに乗るのは
 *    「本人がURLを渡した相手」だけ（手渡し共有）。
 *  - 受信側は #p= を復号して閲覧モードで表示し、本人が確認してから端末に保存する。
 *    保存時は座標から PIP→リスク解決を受信端末上で再実行し、自分で判定したのと同じ状態にする。
 *
 * ペイロードはキー短縮＋ビット詰めでQRに収まる長さに保つ（検証: 最大構成でも数百文字）。
 *  v: バージョン（1固定） / w: 区市町村 / t: 町丁目 / a: 表示住所
 *  y,x: lat,lng（小数5桁≒1m） / s: 世帯人数
 *  g: 年齢層ビット [infant=1, child=2, adult=4, senior=8]
 *  c: 属性ビット [wheelchair=1, visual=2, hearing=4, dementia=8, medical=16, pregnant=32]
 *  p: ペット（0=none / 1=dog_cat / 2=other） / m: 集合場所メモ / n: 集合場所（避難場所名）
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { locateChomoku } from './pip'
import { resolveRisk } from './risk'
import { usePlanStore, type Coords } from '../store/usePlanStore'
import { useProfileStore, type FamilyProfile, type PetType } from '../store/useProfileStore'

/** 共有ペイロード（復号済み・検証済みの形）。 */
export interface SharedPlanPayload {
  ward: string
  town: string
  /** 送信側で表示していた住所（ヘッダー表示・取り込み時の復元用） */
  address: string
  lat: number
  lng: number
  profile: FamilyProfile
}

/** URL上の圧縮前JSON（キー短縮形）。 */
interface WirePayload {
  v: number
  w: string
  t: string
  a: string
  y: number
  x: number
  s: number
  g: number
  c: number
  p: number
  m: string
  n: string
}

const AGE_KEYS = ['infant', 'child', 'adult', 'senior'] as const
const ATTR_KEYS = ['wheelchair', 'visual', 'hearing', 'dementia', 'medical', 'pregnant'] as const
const PET_VALUES: PetType[] = ['none', 'dog_cat', 'other']

/** 集合場所メモの最大長（URL肥大→QR容量超過の防止。フォーム側 maxLength と対）。 */
export const MEETING_TEXT_MAX = 60

/** ハッシュのプレフィックス。 */
const HASH_PREFIX = '#p='

function packBits<K extends string>(keys: readonly K[], flags: Record<K, boolean>): number {
  let bits = 0
  keys.forEach((k, i) => {
    if (flags[k]) bits |= 1 << i
  })
  return bits
}

function unpackBits<K extends string>(keys: readonly K[], bits: number): Record<K, boolean> {
  const out = {} as Record<K, boolean>
  keys.forEach((k, i) => {
    out[k] = (bits & (1 << i)) !== 0
  })
  return out
}

/** 共有URL（現在のオリジン＋#p=圧縮データ）を生成する。 */
export function encodeSharedPlanUrl(payload: SharedPlanPayload): string {
  const wire: WirePayload = {
    v: 1,
    w: payload.ward,
    t: payload.town,
    a: payload.address,
    y: Math.round(payload.lat * 1e5) / 1e5,
    x: Math.round(payload.lng * 1e5) / 1e5,
    s: payload.profile.size,
    g: packBits(AGE_KEYS, payload.profile.ages),
    c: packBits(ATTR_KEYS, payload.profile.attrs),
    p: Math.max(0, PET_VALUES.indexOf(payload.profile.pet)),
    m: payload.profile.meetingText.slice(0, MEETING_TEXT_MAX),
    n: payload.profile.meetingAreaName ?? '',
  }
  const compressed = compressToEncodedURIComponent(JSON.stringify(wire))
  return `${window.location.origin}${window.location.pathname}${HASH_PREFIX}${compressed}`
}

/** 文字列フィールドの型・長さ検証。 */
function isStr(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max
}

/**
 * location.hash から共有ペイロードを復号・検証する。
 * 共有URLでない（#p=が無い）場合は null、壊れている場合は 'invalid' を返す。
 * URL経由の外部入力なので型・範囲・長さを厳格に検証する（表示はReactのエスケープに乗る）。
 */
export function decodeSharedPlanFromHash(hash: string): SharedPlanPayload | 'invalid' | null {
  if (!hash.startsWith(HASH_PREFIX)) return null
  const raw = hash.slice(HASH_PREFIX.length)
  if (!raw) return 'invalid'
  try {
    const json = decompressFromEncodedURIComponent(raw)
    if (!json) return 'invalid'
    const w = JSON.parse(json) as Partial<WirePayload>
    if (w.v !== 1) return 'invalid'
    if (!isStr(w.w, 20) || w.w === '' || !isStr(w.t, 30) || !isStr(w.a, 80)) return 'invalid'
    if (typeof w.y !== 'number' || w.y < 20 || w.y > 46) return 'invalid' // 日本域の緯度
    if (typeof w.x !== 'number' || w.x < 122 || w.x > 154) return 'invalid' // 日本域の経度
    if (typeof w.s !== 'number' || !Number.isInteger(w.s) || w.s < 1 || w.s > 12) return 'invalid'
    if (typeof w.g !== 'number' || !Number.isInteger(w.g) || w.g < 0 || w.g > 15) return 'invalid'
    if (typeof w.c !== 'number' || !Number.isInteger(w.c) || w.c < 0 || w.c > 63) return 'invalid'
    if (typeof w.p !== 'number' || !Number.isInteger(w.p) || w.p < 0 || w.p > 2) return 'invalid'
    if (!isStr(w.m, MEETING_TEXT_MAX) || !isStr(w.n, 60)) return 'invalid'

    const profile: FamilyProfile = {
      size: w.s,
      ages: unpackBits(AGE_KEYS, w.g),
      attrs: unpackBits(ATTR_KEYS, w.c),
      pet: PET_VALUES[w.p],
      meetingText: w.m,
      meetingAreaName: w.n === '' ? null : w.n,
    }
    return { ward: w.w, town: w.t, address: w.a, lat: w.y, lng: w.x, profile }
  } catch {
    return 'invalid'
  }
}

/** アドレスバーから共有ハッシュを消す（保存/閉じる後に通常画面へ戻すため）。 */
export function clearSharedHash(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

/**
 * 受け取った計画を自分の端末に取り込む。
 * 座標→PIP→リスク解決を受信端末上で再実行（データはすべて端末内/同一オリジン。外部送信なし）し、
 * 判定結果として usePlanStore へ、プロフィールを useProfileStore（IndexedDB）へ保存する。
 * 判定できない座標（都外等）は false。
 */
export async function adoptSharedPlan(payload: SharedPlanPayload): Promise<boolean> {
  const pip = await locateChomoku(payload.lng, payload.lat)
  if (!pip) return false
  const risk = await resolveRisk(pip.chomokuId)
  if (!risk) return false

  // 共有座標は送信側の判定済み地点なので高精度扱いで復元する
  const coords: Coords = { lat: payload.lat, lng: payload.lng, level: 8, precise: true }
  useProfileStore.getState().saveProfile(payload.profile)
  usePlanStore.getState().adoptShared(payload.address, coords, pip.chomokuId, risk)
  return true
}

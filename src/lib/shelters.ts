/**
 * shelters.ts — 避難場所（災害時に逃げる先）・避難所（生活避難先）の取得と最寄り計算。
 *
 * データ（東京都総務局「避難所・避難場所一覧」を加工）:
 *  - /data/evacuation_areas.geojson   … 避難場所 2,251件（Point）
 *      name, ward, address, 災害種別フラグ8種（bool）, バリアフリー4種（true/null）
 *  - /data/evacuation_centers.geojson … 避難所 2,560件（Point）
 *      name, ward, address, バリアフリー4種（true/null）
 *  - /data/fukushi_hinanjo.geojson    … 福祉避難所（二次避難所）938件・24自治体（23区＋清瀬市、Point）
 *      muni, name, address, category, source（各区市の公表資料を加工）
 *  - /data/fukushi_hinanjo_coverage.json … 福祉避難所データを公開済みの自治体リスト（covered）
 *  - /data/hospitals.geojson          … 災害拠点病院83＋災害拠点連携病院138＝221施設（Point）
 *      name, address, tel, area, type(kyoten|renkei), beds, tertiary_er
 *      （東京都保健医療局の一覧を加工。元データに座標が無いためジオコーディングで付与）
 *
 * 設計（w3_status.md 準拠）:
 *  - 避難場所は「今まさに逃げる先」として災害種別フラグでフィルタ。
 *  - 避難所は「生活避難先」。区別して1件だけ最寄りを併記。
 *  - 徒歩分 = ceil(直線距離m / 80)。表記は「約X分（直線距離）」。
 *  - 距離は Haversine（大圏距離）で自前計算（@turf/distance は未導入。新依存を増やさない）。
 *  - 全件（2,251 / 2,560 / 938）を線形走査（数ms）。空間索引は不要。
 *  - 福祉避難所は「開設後に自治体から案内される二次避難先」。運営が自治体単位のため、
 *    検索は判定地点と同一自治体内に限定し、未公開自治体は not_covered を返す（正直路線）。
 */

import type { HazardKey } from './constants'

/** 避難場所・避難所が備えるバリアフリー設備（true=公表データで該当 / null=情報なし）。 */
export interface BarrierFree {
  /** 車椅子対応トイレ */
  wheelchair_toilet: boolean | null
  /** エレベーター or 1階に受入スペース */
  elevator_or_1f: boolean | null
  /** 点字ブロック */
  braille_block: boolean | null
  /** スロープ */
  slope: boolean | null
}

/** 対応災害種別フラグ（避難場所のみ。true=対応 / false=非対応）。 */
export interface DisasterFlags {
  /** 地震（大規模火事から身を守る一時集合・避難場所を含む） */
  earthquake: boolean
  /** 洪水（河川氾濫） */
  flood: boolean
  /** 津波 */
  tsunami: boolean
  /** 高潮 */
  storm_surge: boolean
  /** 内水氾濫（今回タブなし・未使用） */
  inland_flood: boolean
  /** 崖崩れ・土石流・地滑り（今回タブなし・未使用） */
  landslide: boolean
  /** 大規模な火事（今回タブなし・未使用） */
  fire: boolean
  /** 火山現象（今回タブなし・未使用） */
  volcano: boolean
}

/** GeoJSONの生プロパティ（避難場所）。 */
type AreaProps = { name: string; ward: string; address: string } & DisasterFlags & BarrierFree
/** GeoJSONの生プロパティ（避難所）。 */
type CenterProps = { name: string; ward: string; address: string } & BarrierFree

/** アプリ内で扱う避難施設（種別を明示）。 */
export interface Facility {
  /** 施設種別。area=避難場所（災害時）／center=避難所（生活避難） */
  kind: 'area' | 'center'
  name: string
  ward: string
  address: string
  lng: number
  lat: number
  /** バリアフリー設備 */
  bf: BarrierFree
  /** 対応災害（避難場所のみ。避難所はundefined） */
  disasters?: DisasterFlags
}

/** わが家からの距離を付与した施設（最寄り結果用）。 */
export interface FacilityWithDistance extends Facility {
  /** 直線距離（m） */
  distanceM: number
  /** 徒歩分（ceil(distanceM/80)） */
  walkMin: number
}

/** 避難場所GeoJSONのURL（MapLibreのgeojsonソースからも直接参照する）。 */
export const AREAS_URL = '/data/evacuation_areas.geojson'
/** 避難所GeoJSONのURL（同上）。 */
export const CENTERS_URL = '/data/evacuation_centers.geojson'

/** 徒歩速度の目安（m/分）。80m/分＝分速80m（不動産表記の一般値）。 */
const WALK_SPEED_M_PER_MIN = 80

type FC<P> = { features: Array<{ geometry: { type: 'Point'; coordinates: [number, number] }; properties: P }> }

let areasCache: Facility[] | null = null
let centersCache: Facility[] | null = null
let areasInflight: Promise<Facility[]> | null = null
let centersInflight: Promise<Facility[]> | null = null

function toBarrierFree(p: BarrierFree): BarrierFree {
  return {
    wheelchair_toilet: p.wheelchair_toilet ?? null,
    elevator_or_1f: p.elevator_or_1f ?? null,
    braille_block: p.braille_block ?? null,
    slope: p.slope ?? null,
  }
}

async function fetchFacilities<P extends { name: string; ward: string; address: string }>(
  url: string,
  kind: 'area' | 'center',
): Promise<Facility[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${kind} geojson fetch failed: ${res.status}`)
  const fc = (await res.json()) as FC<P>
  const out: Facility[] = []
  for (const f of fc.features) {
    if (!f.geometry || f.geometry.type !== 'Point') continue
    const [lng, lat] = f.geometry.coordinates
    if (typeof lng !== 'number' || typeof lat !== 'number') continue
    const p = f.properties
    const facility: Facility = {
      kind,
      name: p.name,
      ward: p.ward,
      address: p.address,
      lng,
      lat,
      bf: toBarrierFree(p as unknown as BarrierFree),
    }
    if (kind === 'area') {
      const a = p as unknown as DisasterFlags
      facility.disasters = {
        earthquake: !!a.earthquake,
        flood: !!a.flood,
        tsunami: !!a.tsunami,
        storm_surge: !!a.storm_surge,
        inland_flood: !!a.inland_flood,
        landslide: !!a.landslide,
        fire: !!a.fire,
        volcano: !!a.volcano,
      }
    }
    out.push(facility)
  }
  return out
}

/** 避難場所（2,251件）を取得＋メモリキャッシュ。多重fetch防止。 */
export async function loadAreas(): Promise<Facility[]> {
  if (areasCache) return areasCache
  if (areasInflight) return areasInflight
  areasInflight = fetchFacilities<AreaProps>(AREAS_URL, 'area')
    .then((list) => {
      areasCache = list
      areasInflight = null
      return list
    })
    .catch((err) => {
      areasInflight = null
      throw err
    })
  return areasInflight
}

/** 避難所（2,560件）を取得＋メモリキャッシュ。多重fetch防止。 */
export async function loadCenters(): Promise<Facility[]> {
  if (centersCache) return centersCache
  if (centersInflight) return centersInflight
  centersInflight = fetchFacilities<CenterProps>(CENTERS_URL, 'center')
    .then((list) => {
      centersCache = list
      centersInflight = null
      return list
    })
    .catch((err) => {
      centersInflight = null
      throw err
    })
  return centersInflight
}

/** 避難場所・避難所の両方を先読み（ホーム表示時に呼ぶ）。失敗は握りつぶす（体感速度用）。 */
export async function preloadFacilities(): Promise<void> {
  try {
    await Promise.all([loadAreas(), loadCenters()])
  } catch {
    // 先読みの失敗は無視（実表示時に再取得・エラー処理される）。
  }
}

/**
 * 災害タブ（HazardKey）→ 避難場所の該当フラグ名。
 * 地震=earthquake / 洪水=flood / 津波=tsunami / 高潮=storm_surge。
 */
const HAZARD_TO_FLAG: Record<HazardKey, keyof DisasterFlags> = {
  quake: 'earthquake',
  flood: 'flood',
  tsunami: 'tsunami',
  storm: 'storm_surge',
}

/** 指定災害に対応する避難場所だけを抽出。 */
export function filterAreasByHazard(areas: Facility[], hazard: HazardKey): Facility[] {
  const flag = HAZARD_TO_FLAG[hazard]
  return areas.filter((a) => a.disasters?.[flag] === true)
}

/**
 * Haversine（大圏距離, m）。地球半径6,371km。
 * turf.distance相当。都内スケールでは平面近似でも足りるが、汎用に大圏で計算。
 */
export function haversineM(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const R = 6_371_000 // m
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** 直線距離m → 徒歩分（ceil(m/80)、最低1分）。 */
export function walkMinutes(distanceM: number): number {
  return Math.max(1, Math.ceil(distanceM / WALK_SPEED_M_PER_MIN))
}

/**
 * わが家座標に近い順にN件を返す（距離・徒歩分を付与）。
 * 座標を持つ施設ならジェネリックに使える（Facility／FukushiFacility共用）。
 * @param origin わが家座標 [lng, lat]
 * @param facilities 対象施設（フィルタ済みでよい）
 * @param n 件数
 */
export function nearest<T extends { lng: number; lat: number }>(
  origin: { lng: number; lat: number },
  facilities: T[],
  n: number,
): Array<T & { distanceM: number; walkMin: number }> {
  const scored = facilities.map((f) => {
    const distanceM = haversineM(origin.lng, origin.lat, f.lng, f.lat)
    return { ...f, distanceM, walkMin: walkMinutes(distanceM) }
  })
  scored.sort((a, b) => a.distanceM - b.distanceM)
  return scored.slice(0, n)
}

/** 単一の最寄り（無ければ null）。 */
export function nearestOne<T extends { lng: number; lat: number }>(
  origin: { lng: number; lat: number },
  facilities: T[],
): (T & { distanceM: number; walkMin: number }) | null {
  return nearest(origin, facilities, 1)[0] ?? null
}

/** バリアフリー設備のうち true のものだけをラベル配列で返す（アイコン表示用）。 */
export function activeBarrierFree(bf: BarrierFree): Array<{ key: keyof BarrierFree; label: string; icon: string }> {
  const defs: Array<{ key: keyof BarrierFree; label: string; icon: string }> = [
    { key: 'wheelchair_toilet', label: '車椅子対応トイレ', icon: '🚻' },
    { key: 'elevator_or_1f', label: 'エレベーター/1階受入', icon: '🛗' },
    { key: 'braille_block', label: '点字ブロック', icon: '⠿' },
    { key: 'slope', label: 'スロープ', icon: '♿' },
  ]
  return defs.filter((d) => bf[d.key] === true)
}

// ─────────────────────────────────────────────────────────────
// 福祉避難所（二次避難所）
// ─────────────────────────────────────────────────────────────

/** 福祉避難所GeoJSONのURL。 */
export const FUKUSHI_URL = '/data/fukushi_hinanjo.geojson'
/** 福祉避難所カバレッジ（データ公開済み自治体リスト）のURL。 */
export const FUKUSHI_COVERAGE_URL = '/data/fukushi_hinanjo_coverage.json'

/**
 * 福祉避難所（二次避難所）。要配慮者のために自治体が災害後に開設する避難先で、
 * 直接向かう場所ではない（表示時は必ず STRINGS.fukushi.roleNote の注記を添える）。
 */
export interface FukushiFacility {
  kind: 'fukushi'
  name: string
  /** 区市町村名（例: 世田谷区）。chomoku_lookup の ward と同一形式 */
  muni: string
  /** 自治体内の住所（区市町村名を含まない場合がある） */
  address: string
  /** 自治体公表の施設区分（例: 福祉避難所（高齢者）／二次避難所。自治体ごとに呼称が異なる） */
  category: string
  /** データの出所（自治体名＋公表資料名） */
  source: string
  lng: number
  lat: number
}

/** 距離付き福祉避難所（最寄り結果用）。 */
export type FukushiWithDistance = FukushiFacility & { distanceM: number; walkMin: number }

/** GeoJSONの生プロパティ（福祉避難所）。 */
type FukushiProps = {
  muni: string
  name: string
  address: string
  category: string
  source: string
  updated: string | null
}

/** カバレッジJSONの形（covered以外の集計キーはアプリでは使わない）。 */
type FukushiCoverage = { covered: string[] }

let fukushiCache: FukushiFacility[] | null = null
let fukushiInflight: Promise<FukushiFacility[]> | null = null
let coverageCache: string[] | null = null
let coverageInflight: Promise<string[]> | null = null

/** 福祉避難所（938件）を取得＋メモリキャッシュ。多重fetch防止。 */
export async function loadFukushi(): Promise<FukushiFacility[]> {
  if (fukushiCache) return fukushiCache
  if (fukushiInflight) return fukushiInflight
  fukushiInflight = fetch(FUKUSHI_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`fukushi geojson fetch failed: ${res.status}`)
      return res.json() as Promise<FC<FukushiProps>>
    })
    .then((fc) => {
      const out: FukushiFacility[] = []
      for (const f of fc.features) {
        if (!f.geometry || f.geometry.type !== 'Point') continue
        const [lng, lat] = f.geometry.coordinates
        if (typeof lng !== 'number' || typeof lat !== 'number') continue
        const p = f.properties
        out.push({
          kind: 'fukushi',
          name: p.name,
          muni: p.muni,
          address: p.address,
          category: p.category,
          source: p.source,
          lng,
          lat,
        })
      }
      fukushiCache = out
      fukushiInflight = null
      return out
    })
    .catch((err) => {
      fukushiInflight = null
      throw err
    })
  return fukushiInflight
}

/** 福祉避難所データを公開済みの自治体名リスト（24自治体）を取得＋メモリキャッシュ。 */
export async function loadFukushiCoverage(): Promise<string[]> {
  if (coverageCache) return coverageCache
  if (coverageInflight) return coverageInflight
  coverageInflight = fetch(FUKUSHI_COVERAGE_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`fukushi coverage fetch failed: ${res.status}`)
      return res.json() as Promise<FukushiCoverage>
    })
    .then((c) => {
      coverageCache = c.covered
      coverageInflight = null
      return c.covered
    })
    .catch((err) => {
      coverageInflight = null
      throw err
    })
  return coverageInflight
}

/**
 * 福祉避難所の検索結果。
 * covered     … 公開自治体。同一自治体内の最寄りN件（distanceM/walkMin付き）を返す
 * not_covered … 未公開自治体。UIは「準備中」文言（STRINGS.fukushi.notCovered）を表示する
 */
export type FukushiSearchResult =
  | { status: 'covered'; muni: string; nearest: FukushiWithDistance[] }
  | { status: 'not_covered'; muni: string }

/**
 * 判定地点の自治体の福祉避難所を近い順にN件返す。
 * 福祉避難所は自治体が自区市民のために開設するため、検索は同一自治体内に限定する
 * （隣接区の施設を案内しない）。自治体が未公開なら not_covered。
 * @param origin わが家座標
 * @param muni 判定地点の区市町村名（RiskInfo.ward をそのまま渡す）
 * @param n 件数（既定3）
 */
export async function findNearestFukushi(
  origin: { lng: number; lat: number },
  muni: string,
  n = 3,
): Promise<FukushiSearchResult> {
  const [facilities, covered] = await Promise.all([loadFukushi(), loadFukushiCoverage()])
  if (!covered.includes(muni)) {
    return { status: 'not_covered', muni }
  }
  const inMuni = facilities.filter((f) => f.muni === muni)
  return { status: 'covered', muni, nearest: nearest(origin, inMuni, n) }
}

// ─────────────────────────────────────────────────────────────
// 災害拠点病院・災害拠点連携病院
// ─────────────────────────────────────────────────────────────

/** 災害拠点病院等GeoJSONのURL（MapLibreのgeojsonソースからも直接参照する）。 */
export const HOSPITALS_URL = '/data/hospitals.geojson'

/**
 * 災害時に重症者を受け入れる病院。
 * kyoten … 災害拠点病院（83施設）。重症者の受け入れ・災害医療の拠点
 * renkei … 災害拠点連携病院（138施設）。拠点病院を補完し中等症等を受け入れる
 * 軽症で自己判断して向かう場所ではないため、表示時は必ず
 * STRINGS.hospital.roleNote の注記を添える。
 */
export interface HospitalFacility {
  kind: 'hospital'
  type: 'kyoten' | 'renkei'
  name: string
  address: string
  /** 電話番号（ハイフン区切りに正規化済み） */
  tel: string
  /** 二次保健医療圏（例: 区中央部） */
  area: string
  /** 三次救急（救命救急センター等）に該当するか。連携病院は常にfalse */
  tertiaryEr: boolean
  lng: number
  lat: number
}

/** 距離付き病院（最寄り結果用）。 */
export type HospitalWithDistance = HospitalFacility & { distanceM: number; walkMin: number }

/** GeoJSONの生プロパティ（病院）。 */
type HospitalProps = {
  name: string
  address: string
  tel: string
  area: string
  type: 'kyoten' | 'renkei'
  beds: string
  tertiary_er: boolean
  mark: string
}

let hospitalsCache: HospitalFacility[] | null = null
let hospitalsInflight: Promise<HospitalFacility[]> | null = null

/** 災害拠点病院等（221施設）を取得＋メモリキャッシュ。多重fetch防止。 */
export async function loadHospitals(): Promise<HospitalFacility[]> {
  if (hospitalsCache) return hospitalsCache
  if (hospitalsInflight) return hospitalsInflight
  hospitalsInflight = fetch(HOSPITALS_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`hospitals geojson fetch failed: ${res.status}`)
      return res.json() as Promise<FC<HospitalProps>>
    })
    .then((fc) => {
      const out: HospitalFacility[] = []
      for (const f of fc.features) {
        if (!f.geometry || f.geometry.type !== 'Point') continue
        const [lng, lat] = f.geometry.coordinates
        if (typeof lng !== 'number' || typeof lat !== 'number') continue
        const p = f.properties
        out.push({
          kind: 'hospital',
          type: p.type,
          name: p.name,
          address: p.address,
          tel: p.tel,
          area: p.area,
          tertiaryEr: p.tertiary_er === true,
          lng,
          lat,
        })
      }
      hospitalsCache = out
      hospitalsInflight = null
      return out
    })
    .catch((err) => {
      hospitalsInflight = null
      throw err
    })
  return hospitalsInflight
}

/**
 * 病院リストから提示順N件を選ぶ（純関数。取得と分離してテスト可能にしている）。
 * 単純な距離順ではなく災害拠点病院（kyoten）を先に置き、足りない分だけ
 * 連携病院（renkei）で埋める。拠点病院が重症者受け入れの一次窓口として
 * 位置づけられているため。
 */
export function orderHospitals(
  origin: { lng: number; lat: number },
  all: HospitalFacility[],
  n: number,
): HospitalWithDistance[] {
  const kyoten = nearest(origin, all.filter((h) => h.type === 'kyoten'), n)
  if (kyoten.length >= n) return kyoten
  const renkei = nearest(origin, all.filter((h) => h.type === 'renkei'), n - kyoten.length)
  return [...kyoten, ...renkei]
}

/**
 * わが家に近い病院をN件返す。
 * @param origin わが家座標
 * @param n 件数（既定2）
 */
export async function findNearestHospitals(
  origin: { lng: number; lat: number },
  n = 2,
): Promise<HospitalWithDistance[]> {
  return orderHospitals(origin, await loadHospitals(), n)
}

/**
 * 外部の地図アプリで「現在地 → 避難場所」の徒歩ルートを開くURLを組む。
 *
 * 出発地（origin）は意図的に渡さない。省略すると地図アプリ側が自分の許可を取って
 * 現在地を使うため、本アプリが自宅やGPSの座標を外部へ送らずに済む。
 * URLに載るのは行き先＝東京都のオープンデータで公表されている公共施設の座標のみ。
 *
 * Google MapsのユニバーサルURLを使う。アプリが入っていれば各OSのアプリが開き、
 * 無ければブラウザ版が開くため、iOS/Android/PCを1本で賄える。
 */
export function walkingRouteUrl(dest: { lng: number; lat: number }): string {
  const q = new URLSearchParams({
    api: '1',
    destination: `${dest.lat},${dest.lng}`, // Google Mapsは lat,lng の順
    travelmode: 'walking',
  })
  return `https://www.google.com/maps/dir/?${q.toString()}`
}

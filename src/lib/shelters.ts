/**
 * shelters.ts — 避難場所（災害時に逃げる先）・避難所（生活避難先）の取得と最寄り計算。
 *
 * データ（東京都総務局「避難所・避難場所一覧」を加工）:
 *  - /data/evacuation_areas.geojson   … 避難場所 2,251件（Point）
 *      name, ward, address, 災害種別フラグ8種（bool）, バリアフリー4種（true/null）
 *  - /data/evacuation_centers.geojson … 避難所 2,560件（Point）
 *      name, ward, address, バリアフリー4種（true/null）
 *
 * 設計（w3_status.md 準拠）:
 *  - 避難場所は「今まさに逃げる先」として災害種別フラグでフィルタ。
 *  - 避難所は「生活避難先」。区別して1件だけ最寄りを併記。
 *  - 徒歩分 = ceil(直線距離m / 80)。表記は「約X分（直線距離）」。
 *  - 距離は Haversine（大圏距離）で自前計算（@turf/distance は未導入。新依存を増やさない）。
 *  - 全件（2,251 / 2,560）を線形走査（数ms）。空間索引は不要。
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
 * @param origin わが家座標 [lng, lat]
 * @param facilities 対象施設（フィルタ済みでよい）
 * @param n 件数
 */
export function nearest(
  origin: { lng: number; lat: number },
  facilities: Facility[],
  n: number,
): FacilityWithDistance[] {
  const scored: FacilityWithDistance[] = facilities.map((f) => {
    const distanceM = haversineM(origin.lng, origin.lat, f.lng, f.lat)
    return { ...f, distanceM, walkMin: walkMinutes(distanceM) }
  })
  scored.sort((a, b) => a.distanceM - b.distanceM)
  return scored.slice(0, n)
}

/** 単一の最寄り（無ければ null）。 */
export function nearestOne(
  origin: { lng: number; lat: number },
  facilities: Facility[],
): FacilityWithDistance | null {
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

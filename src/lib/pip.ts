/**
 * pip.ts — 緯度経度 → 町丁目ID の point-in-polygon 判定。
 * /data/chomoku_pip.geojson（簡略化済み・IDのみ）をfetch＋メモリキャッシュ。
 * bboxプレフィルタ → Turf.js booleanPointInPolygon。
 * ミス時は近傍フォールバック（bboxを約50m拡張して候補を集め、
 * 境界への最短距離が最小のポリゴンに割り当て。それでも無ければ null）。
 */

import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point as turfPoint } from '@turf/helpers'
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson'

interface IndexedFeature {
  id: number
  bbox: [number, number, number, number] // [minX, minY, maxX, maxY]
  feature: Feature<Polygon | MultiPolygon>
}

const PIP_URL = '/data/chomoku_pip.geojson'

/** 東京付近の緯度における経度1度あたりの距離は約90km。50m ≒ 0.00056度、緯度50m ≒ 0.00045度。 */
const FALLBACK_LAT_DEG = 0.00045 // 約50m（緯度方向）
const FALLBACK_LNG_DEG = 0.00056 // 約50m（経度方向、緯度35.7付近）

let index: IndexedFeature[] | null = null
let inflight: Promise<IndexedFeature[]> | null = null

function computeBbox(geom: Polygon | MultiPolygon): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const scan = (ring: Position[]) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) scan(ring)
  } else {
    for (const poly of geom.coordinates) for (const ring of poly) scan(ring)
  }
  return [minX, minY, maxX, maxY]
}

/** GeoJSONを取得してbbox付きインデックスを構築（メモリキャッシュ）。 */
async function loadIndex(): Promise<IndexedFeature[]> {
  if (index) return index
  if (inflight) return inflight
  inflight = fetch(PIP_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`pip geojson fetch failed: ${res.status}`)
      return res.json() as Promise<{ features: Feature<Polygon | MultiPolygon>[] }>
    })
    .then((fc) => {
      const built: IndexedFeature[] = []
      for (const f of fc.features) {
        if (!f.geometry) continue
        const id = (f.properties as { ID?: number })?.ID
        if (id == null) continue
        built.push({ id, bbox: computeBbox(f.geometry), feature: f })
      }
      index = built
      inflight = null
      return built
    })
    .catch((err) => {
      inflight = null
      throw err
    })
  return inflight
}

/** 事前ロード（ホーム表示時に呼んで体感速度を上げる）。 */
export async function preloadPip(): Promise<void> {
  await loadIndex()
}

function pointInFeature(lng: number, lat: number, feature: Feature<Polygon | MultiPolygon>): boolean {
  const pt = turfPoint([lng, lat])
  return booleanPointInPolygon(pt, feature)
}

/** 点から線分への最短距離（度単位・平面近似。近傍比較の相対指標として十分）。 */
function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  const ex = px - cx
  const ey = py - cy
  return Math.sqrt(ex * ex + ey * ey)
}

/** 点からポリゴン境界（全リング）への最短距離。 */
function distToBoundary(lng: number, lat: number, geom: Polygon | MultiPolygon): number {
  let best = Infinity
  const scanRing = (ring: Position[]) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const d = distPointToSegment(lng, lat, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1])
      if (d < best) best = d
    }
  }
  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates) scanRing(ring)
  } else {
    for (const poly of geom.coordinates) for (const ring of poly) scanRing(ring)
  }
  return best
}

export interface PipResult {
  chomokuId: number
  /** true=ポリゴン内にヒット、false=近傍フォールバックで割当 */
  exact: boolean
}

/**
 * 緯度経度 → 町丁目ID。
 * 1) bboxプレフィルタ＋booleanPointInPolygon で厳密判定
 * 2) ミス時は約50m拡張bbox内の候補から、境界最短距離が最小のポリゴンに割当
 * 3) それでも無ければ null（判定対象外）
 */
export async function locateChomoku(lng: number, lat: number): Promise<PipResult | null> {
  const idx = await loadIndex()

  // --- 1) 厳密判定（bboxプレフィルタ） ---
  for (const f of idx) {
    const [minX, minY, maxX, maxY] = f.bbox
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue
    if (pointInFeature(lng, lat, f.feature)) {
      return { chomokuId: f.id, exact: true }
    }
  }

  // --- 2) 近傍フォールバック（bboxを約50m拡張して候補収集 → 境界最短距離最小） ---
  let bestId: number | null = null
  let bestDist = Infinity
  for (const f of idx) {
    const [minX, minY, maxX, maxY] = f.bbox
    if (
      lng < minX - FALLBACK_LNG_DEG ||
      lng > maxX + FALLBACK_LNG_DEG ||
      lat < minY - FALLBACK_LAT_DEG ||
      lat > maxY + FALLBACK_LAT_DEG
    ) {
      continue
    }
    const d = distToBoundary(lng, lat, f.feature.geometry)
    if (d < bestDist) {
      bestDist = d
      bestId = f.id
    }
  }

  if (bestId != null) {
    return { chomokuId: bestId, exact: false }
  }

  // --- 3) 対象外 ---
  return null
}

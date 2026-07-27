/**
 * hydrants.ts — 公設消火栓（東京消防庁, 133,956件）の取得と最寄り計算。
 *
 * データ: /data/hydrants/{cx}_{cy}.json
 *   0.01°グリッドで分割した座標のみの配列 [[lng, lat], ...]（小数5桁＝約1m）。
 *   生成は scripts/build_hydrant_grid.py。1,485セル・合計2.66MB。
 *
 * 設計:
 *  - 13万件を1ファイルで配れないため、自宅周辺の3×3セル（約2.7km四方）だけを取る。
 *    PMTiles化しない理由は本番Pagesが Range 非対応でR2手動配置が要るため（README参照）。
 *  - 実データ上、消火栓同士の最大間隔は約804m。3×3窓は自宅がセル端にあっても
 *    901m以上の余白を持つため、通常は3×3で最寄りが確定する。
 *    それでも取りこぼす可能性に備え、最寄りが遠すぎる／0件のときだけ5×5へ広げる。
 *  - 属性は持たない（元データは全件「公設上水道消火栓」。防火水槽は含まれない）。
 */

import { haversineM } from './shelters'

/** セルサイズ（度）。build_hydrant_grid.py の CELL_DEG と必ず一致させること。 */
export const HYDRANT_CELL_DEG = 0.01

/** 3×3で確定とみなす距離の上限（m）。超えたら5×5へ広げて取り直す。 */
const NEAR_ENOUGH_M = 900

/** 消火栓の座標（[lng, lat]）。 */
export type HydrantPoint = { lng: number; lat: number }

/** セル座標（整数インデックス）。 */
type Cell = { cx: number; cy: number }

/** 緯度経度 → セル座標。東京都内は正の座標のみ。 */
export function cellOf(lng: number, lat: number): Cell {
  return {
    cx: Math.floor(lng / HYDRANT_CELL_DEG),
    cy: Math.floor(lat / HYDRANT_CELL_DEG),
  }
}

/** セル座標 → 配信URL。 */
export function cellUrl(cell: Cell): string {
  return `/data/hydrants/${cell.cx}_${cell.cy}.json`
}

/** 中心セルから半径ringぶんの正方形範囲のセルを列挙（ring=1 なら3×3の9件）。 */
function cellsAround(center: Cell, ring: number): Cell[] {
  const out: Cell[] = []
  for (let dx = -ring; dx <= ring; dx++) {
    for (let dy = -ring; dy <= ring; dy++) {
      out.push({ cx: center.cx + dx, cy: center.cy + dy })
    }
  }
  return out
}

/**
 * わが家周辺3×3セルのURL（9件）。
 * オフラインパック（offlineTiles.ts）のプリキャッシュ対象にも使う。
 */
export function hydrantCellUrls(origin: { lng: number; lat: number }): string[] {
  return cellsAround(cellOf(origin.lng, origin.lat), 1).map(cellUrl)
}

// セル単位のメモリキャッシュ。海上・都外のセルは存在しない＝空配列として覚える。
const cellCache = new Map<string, HydrantPoint[]>()
const cellInflight = new Map<string, Promise<HydrantPoint[]>>()

/** 1セルを取得（404は「そのセルは0件」として扱う）。多重fetch防止つき。 */
async function loadCell(cell: Cell): Promise<HydrantPoint[]> {
  const url = cellUrl(cell)
  const cached = cellCache.get(url)
  if (cached) return cached
  const inflight = cellInflight.get(url)
  if (inflight) return inflight

  const p = fetch(url)
    .then(async (res) => {
      if (res.status === 404) return [] as HydrantPoint[]
      if (!res.ok) throw new Error(`hydrant cell fetch failed: ${res.status}`)
      const raw = (await res.json()) as Array<[number, number]>
      return raw.map(([lng, lat]) => ({ lng, lat }))
    })
    .then((pts) => {
      cellCache.set(url, pts)
      cellInflight.delete(url)
      return pts
    })
    .catch((err) => {
      cellInflight.delete(url)
      throw err
    })
  cellInflight.set(url, p)
  return p
}

/** 複数セルをまとめて取得して1つの配列にする（取得できなかったセルは無視）。 */
async function loadCells(cells: Cell[]): Promise<HydrantPoint[]> {
  const results = await Promise.all(cells.map((c) => loadCell(c).catch(() => [] as HydrantPoint[])))
  return results.flat()
}

/**
 * わが家周辺の消火栓（3×3セル＝約2.7km四方）。地図レイヤ用。
 * 全都を持たないため、地図の凡例には「自宅周辺のみ表示」の注記を添えること。
 */
export async function loadHydrantsAround(origin: { lng: number; lat: number }): Promise<HydrantPoint[]> {
  return loadCells(cellsAround(cellOf(origin.lng, origin.lat), 1))
}

/** 距離付きの最寄り消火栓。 */
export type NearestHydrant = HydrantPoint & { distanceM: number }

function pickNearest(origin: { lng: number; lat: number }, pts: HydrantPoint[]): NearestHydrant | null {
  let best: NearestHydrant | null = null
  for (const p of pts) {
    const distanceM = haversineM(origin.lng, origin.lat, p.lng, p.lat)
    if (!best || distanceM < best.distanceM) best = { ...p, distanceM }
  }
  return best
}

/**
 * 最寄りの消火栓（無ければ null）。
 * まず3×3で探し、見つからない／900mより遠い場合だけ5×5に広げて取り直す。
 */
export async function nearestHydrant(origin: { lng: number; lat: number }): Promise<NearestHydrant | null> {
  const center = cellOf(origin.lng, origin.lat)
  const inner = pickNearest(origin, await loadCells(cellsAround(center, 1)))
  if (inner && inner.distanceM <= NEAR_ENOUGH_M) return inner
  const wider = pickNearest(origin, await loadCells(cellsAround(center, 2)))
  return wider ?? inner
}

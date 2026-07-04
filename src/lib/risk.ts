/**
 * risk.ts — 町丁目ID → 危険度リスク解決。
 * /data/chomoku_lookup.json（5,192件）をfetch＋メモリキャッシュし、
 * 町丁目IDから建物・火災・総合ランク＋順位、地盤分類を引く。
 */

import { groundToLiquefaction } from './constants'

/** ルックアップJSONの1エントリ（生の形）。 */
interface LookupEntry {
  ward: string
  town: string
  ground: string
  bldg: { rank: number; order: number }
  fire: { rank: number; order: number }
  total: { rank: number; order: number }
}

type LookupTable = Record<string, LookupEntry>

/** アプリ内で扱うリスク情報（解決済み）。 */
export interface RiskInfo {
  /** 町丁目ID（文字列） */
  chomokuId: string
  ward: string
  town: string
  /** 地盤分類（例：沖積低地3） */
  ground: string
  /** 液状化しやすさプロキシ（1〜4、参考） */
  liquefaction: number
  building: { rank: number; order: number }
  fire: { rank: number; order: number }
  total: { rank: number; order: number }
}

const LOOKUP_URL = '/data/chomoku_lookup.json'

let cache: LookupTable | null = null
let inflight: Promise<LookupTable> | null = null

/** ルックアップJSONを取得（メモリキャッシュ・多重fetch防止）。 */
export async function loadLookup(): Promise<LookupTable> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = fetch(LOOKUP_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`lookup fetch failed: ${res.status}`)
      return res.json() as Promise<LookupTable>
    })
    .then((table) => {
      cache = table
      inflight = null
      return table
    })
    .catch((err) => {
      inflight = null
      throw err
    })
  return inflight
}

/**
 * 町丁目ID → RiskInfo。見つからなければ null。
 * @param id 町丁目ID（数値または文字列）
 */
export async function resolveRisk(id: number | string): Promise<RiskInfo | null> {
  const table = await loadLookup()
  const key = String(id)
  const e = table[key]
  if (!e) return null
  return {
    chomokuId: key,
    ward: e.ward,
    town: e.town,
    ground: e.ground,
    liquefaction: groundToLiquefaction(e.ground),
    building: e.bldg,
    fire: e.fire,
    total: e.total,
  }
}

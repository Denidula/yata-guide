/**
 * geocode.ts — 住所文字列 → 緯度経度。
 * 主：@geolonia/normalize-japanese-addresses の normalize()（T3レポートの用法どおり）。
 *   戻り値 point.level が精度を表す（8=街区・地番, 3=丁目代表点, 2=市区町村, 1=都道府県）。
 * フォールバック：国土地理院 AddressSearch API。
 *   島しょ部などで「東京都」を含むと0件になるケースがあるため、prefixを外して再試行する
 *   （T3レポート §4.5 の八丈町非対称バグ対策）。
 */

import { normalize } from '@geolonia/normalize-japanese-addresses'

export interface GeocodeResult {
  lat: number
  lng: number
  /** 位置情報の精度レベル（point.level 相当。8=高精度, ≤3=代表点） */
  level: number
  /** true=街区・地番レベルの高精度, false=丁目代表点相当の粗い座標 */
  precise: boolean
  /** どちらの系で解決したか */
  source: 'geolonia' | 'gsi'
  /** 正規化後の住所（表示用。取得できたところまで） */
  normalized?: string
}

/** point.level >= 8 を高精度とみなす（T3レポートの運用方針）。 */
const PRECISE_LEVEL = 8

/** 全角スペースを除去し前後を整える（郡名+町村名などの表記対策）。 */
function normalizeInput(raw: string): string {
  return raw.replace(/　/g, ' ').trim().replace(/\s+/g, ' ')
}

/**
 * 主：Geolonia normalize()。level>0（都道府県以上判別）かつ point があれば座標採用。
 * 座標が無い / level=0 の場合は null を返してフォールバックへ。
 */
async function geocodeGeolonia(address: string): Promise<GeocodeResult | null> {
  try {
    const r = await normalize(address)
    if (r.level > 0 && r.point) {
      const parts = [r.pref, r.city, r.town, r.addr].filter(Boolean).join('')
      return {
        lat: r.point.lat,
        lng: r.point.lng,
        level: r.point.level,
        precise: r.point.level >= PRECISE_LEVEL,
        source: 'geolonia',
        normalized: parts || undefined,
      }
    }
    return null
  } catch {
    return null
  }
}

interface GsiHit {
  geometry?: { coordinates?: [number, number] }
  properties?: { title?: string }
}

/** GSI AddressSearch を1回叩く（座標が取れれば返す）。 */
async function gsiQuery(q: string): Promise<GeocodeResult | null> {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`
  const res = await fetch(url)
  if (!res.ok) return null
  const hits = (await res.json()) as GsiHit[]
  if (!Array.isArray(hits) || hits.length === 0) return null
  const top = hits[0]
  const coords = top.geometry?.coordinates
  if (!coords || coords.length < 2) return null
  // GSIは常に代表点相当（番地精度でも保証されない）→ precise=false 扱い
  return {
    lat: coords[1],
    lng: coords[0],
    level: 3,
    precise: false,
    source: 'gsi',
    normalized: top.properties?.title,
  }
}

/**
 * フォールバック：GSI。まず入力そのまま、0件なら「東京都」等の都道府県prefixを外して再試行。
 * （島しょ部の自治体名解釈の非対称バグ対策。T3レポート §4.5）
 */
async function geocodeGsi(address: string): Promise<GeocodeResult | null> {
  try {
    const first = await gsiQuery(address)
    if (first) return first
  } catch {
    /* 続けてリトライ */
  }
  // 都道府県prefixを外して再試行
  const stripped = address.replace(/^(東京都|北海道|(?:京都|大阪)府|.{2,3}県)\s*/, '')
  if (stripped && stripped !== address) {
    try {
      return await gsiQuery(stripped)
    } catch {
      return null
    }
  }
  return null
}

/**
 * 住所 → 緯度経度。Geolonia主・GSIフォールバック。
 * 両系失敗時は null。
 */
export async function geocode(rawAddress: string): Promise<GeocodeResult | null> {
  const address = normalizeInput(rawAddress)
  if (!address) return null

  const primary = await geocodeGeolonia(address)
  if (primary) return primary

  return await geocodeGsi(address)
}

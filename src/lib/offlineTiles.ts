/**
 * offlineTiles.ts — 災害モード：自宅周辺の地図タイルのプリキャッシュ（P2-W3）。
 *
 * 方式（phase2_spec.md P2-W3。workboxとRange/206の相性が悪いためSWは使わない）:
 *  - R2のPMTiles（ハザード）は、pmtiles の Source をラップした CachingSource で
 *    「Cache Storage優先→ミス時はRange fetch→取得結果をCacheへ書き戻し（write-through）」。
 *    Cache API は 206 partial を保存できないため、Range結果を**200のフル応答として
 *    合成URLキー（?yr=offset-length）で保存**する。オフライン時はキャッシュだけで
 *    ヘッダー→ディレクトリ→タイルの全readが完結する。
 *  - プリキャッシュ＝「z12〜16の自宅近傍タイルを getZxy で読む」こと。write-throughにより
 *    必要なバイト範囲（ヘッダー/ディレクトリ含む）が自動的にCacheへ揃う。
 *  - 地理院ラスタは通常の200応答なので、タイルURLをfetchしてSWのランタイムキャッシュ
 *    （gsi-raster-tiles, CacheFirst）と同名キャッシュへ cache.put（SW未制御時の保険を兼ねる）。
 *  - /data/* も念のため明示fetch（SWのyata-dataキャッシュ・CacheFirstに載る）。
 *
 * MapView は registerHazardProtocol() で共有PMTilesインスタンスを Protocol に登録して使う
 * （地図の通常表示も同じ CachingSource を通る＝見た範囲は自動でオフライン対応になる）。
 */

import { FetchSource, PMTiles, Protocol, type Source } from 'pmtiles'
import { HAZARDS, TILES_BASE_URL } from './constants'

/** Range断片の保存先キャッシュ名。 */
const RANGE_CACHE = 'yata-offline-tiles'
/** 地理院タイルのSWランタイムキャッシュと同名（vite.config.ts の gsi-raster-tiles）。 */
const GSI_CACHE = 'gsi-raster-tiles'
/** アプリデータのSWランタイムキャッシュと同名（vite.config.ts の yata-data）。 */
const DATA_CACHE = 'yata-data'

/** PMTilesがヘッダー＋ルートディレクトリとして最初に読む範囲（v3仕様で先頭16KiB固定）。 */
const HEADER_RANGE: [number, number] = [0, 16384]

/** プリキャッシュの完了マーカー（localStorage。座標は判定地点＝既にplanストアが保持している情報のみ）。 */
const MARKER_KEY = 'yata-guide-offline-pack'
/** マーカーの有効期限（これを過ぎたら取り直し。タイル改訂への追従）。 */
const MARKER_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14 // 14日

/** 近傍タイルの半径（タイル数）: z→radius。z15/16は広め（詳細ズームでの回遊用）。 */
const ZOOM_RADIUS: Array<[number, number]> = [
  [12, 1],
  [13, 1],
  [14, 1],
  [15, 2],
  [16, 2],
]

/** Range断片の合成キャッシュキー。 */
function rangeKey(url: string, offset: number, length: number): string {
  return `${url}?yr=${offset}-${length}`
}

/**
 * Cache Storage優先＋write-throughのPMTiles Source。
 * Cache APIが使えない環境（プライベートブラウズ等）では素のFetchSourceとして振る舞う。
 */
class CachingSource implements Source {
  private url: string
  private inner: FetchSource
  constructor(url: string) {
    this.url = url
    this.inner = new FetchSource(url)
  }

  getKey(): string {
    return this.url
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
    etag?: string,
  ): Promise<{ data: ArrayBuffer; etag?: string; expires?: string; cacheControl?: string }> {
    const key = rangeKey(this.url, offset, length)
    try {
      const cache = await caches.open(RANGE_CACHE)
      const hit = await cache.match(key)
      if (hit) return { data: await hit.arrayBuffer() }
    } catch {
      // Cache API不可 → ネットワークへ
    }
    const resp = await this.inner.getBytes(offset, length, signal, etag)
    try {
      const cache = await caches.open(RANGE_CACHE)
      // Responseがbodyを消費するため複製を保存する
      await cache.put(
        key,
        new Response(resp.data.slice(0), {
          headers: { 'content-type': 'application/octet-stream' },
        }),
      )
    } catch {
      // 保存失敗は致命でない（オンライン動作は継続）
    }
    return resp
  }
}

/** ハザードURL（TILES_BASE_URL/ファイル名）。 */
export function hazardUrl(file: string): string {
  return `${TILES_BASE_URL}/${file}`
}

/** URL→共有PMTilesインスタンス（地図表示とプリキャッシュで同一インスタンスを使う）。 */
const instances = new Map<string, PMTiles>()
export function getPmtiles(url: string): PMTiles {
  let p = instances.get(url)
  if (!p) {
    p = new PMTiles(new CachingSource(url))
    instances.set(url, p)
  }
  return p
}

/** MapViewのProtocolへ全ハザードの共有インスタンスを登録する（キャッシュ対応ソースが使われる）。 */
export function registerHazardProtocol(protocol: Protocol): void {
  for (const h of HAZARDS) {
    protocol.add(getPmtiles(hazardUrl(h.file)))
  }
}

/** ヘッダーRange断片がキャッシュ済みか（＝オフラインでもこのアーカイブを開ける）。 */
export async function hasCachedHeader(url: string): Promise<boolean> {
  try {
    const cache = await caches.open(RANGE_CACHE)
    return (await cache.match(rangeKey(url, HEADER_RANGE[0], HEADER_RANGE[1]))) != null
  } catch {
    return false
  }
}

/** WGS84 → XYZタイル座標。 */
function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return {
    x: Math.min(n - 1, Math.max(0, x)),
    y: Math.min(n - 1, Math.max(0, y)),
  }
}

/** 近傍タイル一覧（z12〜16、中心±radius）。 */
function neighborhoodTiles(origin: { lng: number; lat: number }): Array<{ z: number; x: number; y: number }> {
  const out: Array<{ z: number; x: number; y: number }> = []
  for (const [z, radius] of ZOOM_RADIUS) {
    const c = lngLatToTile(origin.lng, origin.lat, z)
    const n = 2 ** z
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const x = c.x + dx
        const y = c.y + dy
        if (x < 0 || y < 0 || x >= n || y >= n) continue
        out.push({ z, x, y })
      }
    }
  }
  return out
}

/** 完了マーカー。 */
export interface OfflinePackMarker {
  lat: number
  lng: number
  ts: number
  gsi: number
  hazard: number
}

export function readMarker(): OfflinePackMarker | null {
  try {
    const raw = localStorage.getItem(MARKER_KEY)
    if (!raw) return null
    const m = JSON.parse(raw) as OfflinePackMarker
    if (typeof m.lat !== 'number' || typeof m.lng !== 'number' || typeof m.ts !== 'number') return null
    return m
  } catch {
    return null
  }
}

function writeMarker(m: OfflinePackMarker): void {
  try {
    localStorage.setItem(MARKER_KEY, JSON.stringify(m))
  } catch {
    // 保存できなくても次回再実行されるだけ
  }
}

/** マーカーが現在地点に対して有効か（約200m以内・14日以内）。 */
export function isMarkerFresh(m: OfflinePackMarker | null, origin: { lng: number; lat: number }): boolean {
  if (!m) return false
  if (Date.now() - m.ts > MARKER_MAX_AGE_MS) return false
  const dLat = Math.abs(m.lat - origin.lat)
  const dLng = Math.abs(m.lng - origin.lng)
  return dLat < 0.002 && dLng < 0.0025 // ≒200m
}

/** 進捗コールバック。 */
export type ProgressFn = (done: number, total: number) => void

/**
 * 自宅周辺のプリキャッシュ本体。
 * 1) /data/*（判定・避難先・福祉避難所データ）
 * 2) 地理院ラスタ z12〜16 近傍
 * 3) ハザードPMTiles（開けたアーカイブのみ、z範囲はヘッダーでクランプ）
 * 一部失敗しても続行し、成功数を返す（allSettled方針）。
 */
export async function precacheHomeArea(
  origin: { lng: number; lat: number },
  onProgress?: ProgressFn,
): Promise<{ gsi: number; hazard: number; failed: number }> {
  const tiles = neighborhoodTiles(origin)

  // 開けるハザードアーカイブを先に判定（ヘッダー読取もwrite-throughでキャッシュされる）
  const archives: Array<{ p: PMTiles; minZoom: number; maxZoom: number }> = []
  for (const h of HAZARDS) {
    try {
      const p = getPmtiles(hazardUrl(h.file))
      const header = await p.getHeader()
      archives.push({ p, minZoom: header.minZoom, maxZoom: header.maxZoom })
    } catch {
      // 配信不可アーカイブはスキップ（地図側のデグレード表示と同じ扱い）
    }
  }

  const gsiJobs = tiles.map(
    (t) => () => precacheGsiTile(t.z, t.x, t.y),
  )
  const hazardJobs = archives.flatMap(({ p, minZoom, maxZoom }) =>
    tiles
      .filter((t) => t.z >= minZoom && t.z <= maxZoom)
      .map((t) => () => p.getZxy(t.z, t.x, t.y).then(() => true).catch(() => false)),
  )

  const jobs = [...gsiJobs, ...hazardJobs]
  const total = jobs.length
  let done = 0
  let gsi = 0
  let hazard = 0
  let failed = 0

  // 同時4本で直列プール（相手はレート制限のある公共サーバー。礼儀と安定性優先）
  const CONCURRENCY = 4
  let index = 0
  async function worker() {
    while (index < jobs.length) {
      const i = index++
      const ok = await jobs[i]()
      if (ok) {
        if (i < gsiJobs.length) gsi++
        else hazard++
      } else {
        failed++
      }
      done++
      onProgress?.(done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()))

  // アプリデータ（SWのyata-data CacheFirstに確実に載せる）
  await precacheAppData()

  writeMarker({ lat: origin.lat, lng: origin.lng, ts: Date.now(), gsi, hazard })
  return { gsi, hazard, failed }
}

/** 地理院タイル1枚: fetch→gsi-raster-tilesへ保存（SWのCacheFirstと同名＝オフラインでSWが返せる）。 */
async function precacheGsiTile(z: number, x: number, y: number): Promise<boolean> {
  const url = `https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${x}/${y}.png`
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    try {
      const cache = await caches.open(GSI_CACHE)
      await cache.put(url, res.clone())
    } catch {
      // Cache API不可でもfetch自体はSWランタイムキャッシュに載っている可能性がある
    }
    // bodyを読み切って接続を解放
    await res.arrayBuffer()
    return true
  } catch {
    return false
  }
}

/** 判定・避難先データ（/data/*）をキャッシュへ確実に載せる。 */
async function precacheAppData(): Promise<void> {
  const urls = [
    '/data/chomoku_pip.geojson',
    '/data/chomoku_lookup.json',
    '/data/evacuation_areas.geojson',
    '/data/evacuation_centers.geojson',
    '/data/fukushi_hinanjo.geojson',
    '/data/fukushi_hinanjo_coverage.json',
  ]
  await Promise.all(
    urls.map(async (u) => {
      try {
        const res = await fetch(u)
        if (!res.ok) return
        try {
          const cache = await caches.open(DATA_CACHE)
          await cache.put(u, res.clone())
        } catch {
          // 同上
        }
        await res.arrayBuffer()
      } catch {
        // オフライン等。既存キャッシュがあればそのまま使える
      }
    }),
  )
}

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

/**
 * Range断片の保存先キャッシュ名（データ版付き。レビューM-1）。
 * サーバー側でPMTilesを差し替えたら版を上げ、旧版を STALE_RANGE_CACHES に追加する。
 * etagベースの更新検知（下記CachingSource）が主で、版上げは強制リセット用。
 */
const RANGE_CACHE = 'yata-offline-tiles-v2'
/** 廃止済みキャッシュ名（初回利用時に削除）。 */
const STALE_RANGE_CACHES = ['yata-offline-tiles']

let staleCleanupPromise: Promise<void> | null = null
/** 旧版キャッシュの掃除（プロセス中一度だけ）。 */
function cleanupStaleCaches(): Promise<void> {
  if (!staleCleanupPromise) {
    staleCleanupPromise = (async () => {
      for (const name of STALE_RANGE_CACHES) {
        try {
          await caches.delete(name)
        } catch {
          // Cache API不可環境では何もしない
        }
      }
    })()
  }
  return staleCleanupPromise
}

/**
 * 保存失敗（QuotaExceeded等）の計数（レビューM-15）。
 * precacheHomeArea が開始時にリセットし、終了時に失敗数へ合算してユーザーに見せる。
 */
let rangePutFailures = 0

/** 指定アーカイブのRange断片をすべて削除（etag不一致＝ファイル更新検知時、または保存し直し）。 */
async function purgeArchive(url: string): Promise<void> {
  try {
    const cache = await caches.open(RANGE_CACHE)
    const keys = await cache.keys()
    await Promise.all(
      keys.filter((req) => req.url.startsWith(`${url}?yr=`)).map((req) => cache.delete(req)),
    )
  } catch {
    // 消せない場合は次のetag比較で再度試みる
  }
}
/**
 * 地理院タイルのSWランタイムキャッシュと同名（vite.config.ts の gsi-raster-tiles）。
 * 【設計判断（レビューM-14）】workboxのExpirationPlugin管理外からの直接putだが、あえて同名にする:
 * オフライン時にタイルを返すのはSWのCacheFirstハンドラであり、別名キャッシュに保存すると
 * SWから見えず配信されない（分離するにはinjectManifestでSW自作が必要＝過剰）。
 * プラグインのLRU計数ずれの実害は、maxEntries=300に対しプリキャッシュ77枚＋通常回遊で
 * 上限に達しにくく、達しても評価時に古いタイルが再取得されるだけで壊れない。
 */
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
    await cleanupStaleCaches()
    const key = rangeKey(this.url, offset, length)
    try {
      const cache = await caches.open(RANGE_CACHE)
      const hit = await cache.match(key)
      if (hit) {
        const storedEtag = hit.headers.get('etag') ?? undefined
        if (etag && storedEtag && etag !== storedEtag) {
          // 呼び出し側（PMTiles）が期待する版とキャッシュの版が違う＝アーカイブ更新。
          // 新旧断片の混在読み（破損）を防ぐため、この档の断片を一掃してネットワークへ（レビューM-1）。
          await purgeArchive(this.url)
        } else {
          return { data: await hit.arrayBuffer(), etag: storedEtag }
        }
      }
    } catch {
      // Cache API不可 → ネットワークへ
    }
    const resp = await this.inner.getBytes(offset, length, signal, etag)
    try {
      const cache = await caches.open(RANGE_CACHE)
      // アーカイブ更新検知: 保存済みヘッダー断片のetagと今回のetagが違えば旧断片を一掃してから保存
      if (resp.etag) {
        const head = await cache.match(rangeKey(this.url, HEADER_RANGE[0], HEADER_RANGE[1]))
        const headEtag = head?.headers.get('etag')
        if (headEtag && headEtag !== resp.etag) await purgeArchive(this.url)
      }
      // Responseがbodyを消費するため複製を保存する。etagも保持して整合チェックを生かす
      await cache.put(
        key,
        new Response(resp.data.slice(0), {
          headers: {
            'content-type': 'application/octet-stream',
            ...(resp.etag ? { etag: resp.etag } : {}),
          },
        }),
      )
    } catch {
      // 保存失敗（容量逼迫等）は計上してオンライン動作は継続（レビューM-15）
      rangePutFailures++
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

/**
 * ヘッダーRange断片がキャッシュ済みか（＝オフラインでもこのアーカイブを開ける）。
 * pmtilesの初回読み出しは現行v4で先頭16KiB固定だが、ライブラリ更新で変わっても
 * 静かに壊れないよう「offset=0の断片が存在するか」で判定する（レビューL-9）。
 */
export async function hasCachedHeader(url: string): Promise<boolean> {
  try {
    const cache = await caches.open(RANGE_CACHE)
    // まず現行の固定キーを高速チェック、無ければ offset=0 断片をプレフィックス走査
    if ((await cache.match(rangeKey(url, HEADER_RANGE[0], HEADER_RANGE[1]))) != null) return true
    const keys = await cache.keys()
    const prefix = `${url}?yr=0-`
    return keys.some((req) => req.url.startsWith(prefix))
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

/** マーカー版。RANGE_CACHE の版上げと同時に上げる（旧キャッシュ前提のマーカーを無効化）。 */
const MARKER_VERSION = 2

/** 完了マーカー。 */
export interface OfflinePackMarker {
  v: number
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
    // 版違い（旧キャッシュ時代）のマーカーは無効＝再プリキャッシュさせる
    if (m.v !== MARKER_VERSION) return null
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

/** プリキャッシュ結果。markerWritten=false は「保存済み」を名乗れない状態（レビューR-1）。 */
export interface PrecacheResult {
  gsi: number
  hazard: number
  /** 取得失敗＋保存失敗（QuotaExceeded等）の合計 */
  failed: number
  /** 完了マーカーを書いたか（=次回以降「保存済み」表示してよいか） */
  markerWritten: boolean
}

/** マーカーを書いてよい失敗率の上限（これを超えたら「保存できませんでした」扱い）。 */
const MARKER_MAX_FAILURE_RATE = 0.2

/**
 * 自宅周辺のプリキャッシュ本体。
 * 1) /data/*（判定・避難先・福祉避難所データ）
 * 2) 地理院ラスタ z12〜16 近傍
 * 3) ハザードPMTiles（開けたアーカイブのみ、z範囲はヘッダーでクランプ）
 * 一部失敗しても続行する（allSettled方針）が、完了マーカーは
 * 「ベース地図が1枚以上保存できた かつ 失敗率が閾値以下」のときだけ書く（レビューR-1）。
 * @param opts.force true=キャッシュ済みRange断片を捨てて取り直す（「保存し直す」。レビューM-1）
 */
export async function precacheHomeArea(
  origin: { lng: number; lat: number },
  onProgress?: ProgressFn,
  opts?: { force?: boolean },
): Promise<PrecacheResult> {
  await cleanupStaleCaches()
  rangePutFailures = 0
  if (opts?.force) {
    // 取り直しは先に旧断片を捨てる。以後の失敗時に旧マーカーが「保存済み」を
    // 主張し続けないよう、マーカーも同時に無効化する（成功すれば書き直される）
    try {
      localStorage.removeItem(MARKER_KEY)
    } catch {
      // 消せなくても致命ではない
    }
    for (const h of HAZARDS) {
      await purgeArchive(hazardUrl(h.file))
      // 重要: メモリ上のPMTilesインスタンスはヘッダー/ディレクトリを記憶しているため、
      // 破棄しないと再取得時にそれらのRange断片がキャッシュへ書き戻されず、
      // リロード後のオフラインでアーカイブを開けなくなる（のに保存済み表示になる）
      instances.delete(hazardUrl(h.file))
    }
  }
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
    (t) => () => precacheGsiTile(t.z, t.x, t.y, opts?.force === true),
  )
  const hazardJobs = archives.flatMap(({ p, minZoom, maxZoom }) =>
    tiles
      .filter((t) => t.z >= minZoom && t.z <= maxZoom)
      .map((t) => () => p.getZxy(t.z, t.x, t.y).then(() => true).catch(() => false)),
  )

  // アプリデータ（/data/*）も進捗の分母に含める（100%到達後に処理が続かないように。レビューL-8）
  const dataJobs = APP_DATA_URLS.map((u) => () => precacheDataUrl(u))
  const jobs = [...gsiJobs, ...hazardJobs, ...dataJobs]
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
        else if (i < gsiJobs.length + hazardJobs.length) hazard++
        // dataJobs の成功はマーカー条件（gsi/hazard）に数えない（失敗のみ計上）
      } else {
        failed++
      }
      done++
      onProgress?.(done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()))

  // 保存失敗（write-through側のQuotaExceeded等）も失敗として合算（レビューM-15）
  const failedTotal = failed + rangePutFailures
  rangePutFailures = 0

  // 「保存済み」を名乗ってよいときだけマーカーを書く（レビューR-1）。
  // 全滅・大量失敗時にマーカーを書くと、次回以降オフラインで地図が出ないのに
  // 「保存済み」と表示され続ける（災害時に最も危険な嘘になる）。
  // 失敗時は旧マーカーを消さない＝以前の正常なパックがあればそれは引き続き有効。
  const markerWritten = gsi > 0 && failedTotal <= Math.ceil(total * MARKER_MAX_FAILURE_RATE)
  if (markerWritten) {
    writeMarker({ v: MARKER_VERSION, lat: origin.lat, lng: origin.lng, ts: Date.now(), gsi, hazard })
  }
  return { gsi, hazard, failed: failedTotal, markerWritten }
}

/**
 * 地理院タイル1枚: fetch→gsi-raster-tilesへ保存（SWのCacheFirstと同名＝オフラインでSWが返せる）。
 * 「保存の成功」まで確認して初めて true（fetch成功だけで成功扱いにしない。レビューR-1）。
 */
async function precacheGsiTile(z: number, x: number, y: number, force: boolean): Promise<boolean> {
  const url = `https://cyberjapandata.gsi.go.jp/xyz/pale/${z}/${x}/${y}.png`
  try {
    const res = await fetch(url, force ? { cache: 'reload' } : undefined)
    if (!res.ok) return false
    const body = await res.arrayBuffer()
    const cache = await caches.open(GSI_CACHE)
    await cache.put(
      url,
      new Response(body, {
        headers: { 'content-type': res.headers.get('content-type') ?? 'image/png' },
      }),
    )
    return true
  } catch {
    return false
  }
}

/** 判定・避難先に必要なアプリデータ（/data/*）。 */
const APP_DATA_URLS = [
  '/data/chomoku_pip.geojson',
  '/data/chomoku_lookup.json',
  '/data/evacuation_areas.geojson',
  '/data/evacuation_centers.geojson',
  '/data/fukushi_hinanjo.geojson',
  '/data/fukushi_hinanjo_coverage.json',
]

/** アプリデータ1件をキャッシュへ確実に載せる（保存成功まで確認）。 */
async function precacheDataUrl(u: string): Promise<boolean> {
  try {
    const res = await fetch(u)
    if (!res.ok) return false
    const body = await res.arrayBuffer()
    const cache = await caches.open(DATA_CACHE)
    await cache.put(
      u,
      new Response(body, {
        headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
      }),
    )
    return true
  } catch {
    // オフライン等。既存キャッシュがあればそのまま使える
    return false
  }
}

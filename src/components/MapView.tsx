import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { hasCachedHeader, registerHazardProtocol } from '../lib/offlineTiles'
import { usePlanStore } from '../store/usePlanStore'
import { Icon } from './Icon'
import {
  STRINGS,
  TILES_BASE_URL,
  HAZARDS,
  RANK_COLOR,
  DEPTH_STEPS,
  DEPTH_LEGEND,
  type HazardKey,
} from '../lib/constants'
import {
  loadAreas,
  loadCenters,
  filterAreasByHazard,
  nearest,
  nearestOne,
  activeBarrierFree,
  AREAS_URL,
  CENTERS_URL,
  type Facility,
  type FacilityWithDistance,
} from '../lib/shelters'

/** 東京都心（皇居付近）を初期表示範囲とする。 */
const INITIAL_CENTER: [number, number] = [139.75, 35.69]
const INITIAL_ZOOM = 11
/** わが家判定済みで開いたときのflyTo先ズーム。 */
const HOME_ZOOM = 13
/** 避難先ピンをタップしたときのflyTo先ズーム。 */
const PIN_ZOOM = 15

/** 危険度ポリゴンの塗り透明度。 */
const RISK_FILL_OPACITY = 0.55
/** 浸水系の塗り/円の透明度。 */
const DEPTH_OPACITY = 0.6
/** 地図初期化のタイムアウト（ms）。これを過ぎてもloadが来なければデグレード表示。 */
const MAP_LOAD_TIMEOUT_MS = 7000

/** 最寄り避難場所リストの表示件数。 */
const NEAR_AREA_COUNT = 3

/** 避難先GeoJSONソース/レイヤーのID。 */
const SRC_AREAS = 'evac-areas'
const SRC_CENTERS = 'evac-centers'
const LYR_AREAS = 'evac-areas-circle'
const LYR_CENTERS = 'evac-centers-circle'

type LayerLoadState = 'idle' | 'loading' | 'ready' | 'degraded'

/**
 * デグレード時のconsole.infoを「1回だけ」に抑えるモジュールスコープのフラグ。
 * React StrictModeの二重マウントや、タブ往復による再マウントでも重複させない。
 */
let hasLoggedDegrade = false

/** PMTilesのマジックバイト（ファイル先頭7バイト "PMTiles"）。 */
const PMTILES_MAGIC = 'PMTiles'

/**
 * タイルの配信可否プローブ。
 * 先頭バイトをRangeで要求し、(1)ステータスが206（＝サーバがRange対応）かつ
 * (2)実体がPMTilesマジックで始まる、の両方を満たすときだけ true。
 * これにより、Rangeを無視して200で全量やSPAフォールバックのHTMLを返す環境
 * （本番Cloudflare Pages等）を確実に「配信不可」と判定できる。
 * 例外は投げず、失敗時は false を返す（未捕捉エラーをコンソールに出さない）。
 */
async function probePmtiles(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-6' } })
    // 206以外（200含む）はRange非対応とみなす。
    if (res.status !== 206) return false
    const buf = await res.arrayBuffer()
    if (buf.byteLength < PMTILES_MAGIC.length) return false
    const magic = new TextDecoder().decode(new Uint8Array(buf).slice(0, PMTILES_MAGIC.length))
    return magic === PMTILES_MAGIC
  } catch {
    return false
  }
}

/**
 * MapLibreの fill-color / circle-color 用に、浸水深(m)→段階色の step 式を組む。
 * DEPTH_STEPS は [しきい値, 色] 昇順。step式は「入力 < 次のstop値なら現在の色」。
 */
function depthColorExpression(prop: string): maplibregl.ExpressionSpecification {
  // ['step', ['get', prop], 初期色, stop1, 色1, stop2, 色2, ...]
  const expr: unknown[] = ['step', ['get', prop], DEPTH_STEPS[0][1]]
  for (let i = 1; i < DEPTH_STEPS.length; i++) {
    expr.push(DEPTH_STEPS[i][0], DEPTH_STEPS[i][1])
  }
  return expr as unknown as maplibregl.ExpressionSpecification
}

/**
 * 総合ランク(1〜5)→色の match 式。RANK_COLOR を使用（色覚配慮トークン）。
 */
function rankColorExpression(prop: string): maplibregl.ExpressionSpecification {
  const expr: unknown[] = ['match', ['get', prop]]
  for (let r = 1; r <= 5; r++) {
    expr.push(r, RANK_COLOR[r])
  }
  expr.push('#B9C2CE') // 情報なし（fallback：淡いグレー）
  return expr as unknown as maplibregl.ExpressionSpecification
}

/** 避難場所ピンの色（緑）。GeoJSONソースのfeatureプロパティに依存しない固定色。 */
const AREA_COLOR = '#0f7a4d'
/** 避難所ピンの色（青）。R1: 避難所は #0B4F9E。 */
const CENTER_COLOR = '#0b4f9e'

/** HTMLエスケープ（ポップアップの施設名・住所に外部データを埋め込むため）。 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 距離（m）→わが家からの距離・徒歩分の表記。coords未確定なら空文字。 */
function distanceLine(
  origin: { lng: number; lat: number } | null,
  lng: number,
  lat: number,
): string {
  if (!origin) return ''
  // haversineを再計算せず、呼び出し側で距離付きを渡すのが理想だが、
  // ポップアップは任意ピンにも出せるようここで計算する。
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat - origin.lat)
  const dLng = toRad(lng - origin.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(origin.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2
  const m = 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
  const min = Math.max(1, Math.ceil(m / 80))
  return STRINGS.map.distFmt(m, min)
}

/** 施設ポップアップのHTMLを組み立てる（避難場所/避難所共通）。 */
function facilityPopupHTML(
  f: Facility,
  origin: { lng: number; lat: number } | null,
): string {
  const isArea = f.kind === 'area'
  const kindWord = isArea ? STRINGS.map.popKindArea : STRINGS.map.popKindCenter
  const kindColor = isArea ? AREA_COLOR : CENTER_COLOR

  // 対応災害（避難場所のみ）
  let disasterRow = ''
  if (isArea && f.disasters) {
    const labels: string[] = []
    if (f.disasters.earthquake) labels.push('地震')
    if (f.disasters.flood) labels.push('洪水')
    if (f.disasters.tsunami) labels.push('津波')
    if (f.disasters.storm_surge) labels.push('高潮')
    if (f.disasters.inland_flood) labels.push('内水氾濫')
    if (f.disasters.landslide) labels.push('土砂災害')
    if (f.disasters.fire) labels.push('大規模火事')
    if (f.disasters.volcano) labels.push('火山')
    if (labels.length > 0) {
      disasterRow = `<div class="ev-pop-line"><span class="k">${STRINGS.map.popDisasterLabel}</span>${esc(labels.join('・'))}</div>`
    }
  }

  // バリアフリー
  const bf = activeBarrierFree(f.bf)
  const bfText =
    bf.length > 0
      ? bf.map((b) => `<span class="ev-bf" title="${esc(b.label)}">${b.icon} ${esc(b.label)}</span>`).join('')
      : `<span class="ev-bf none">${STRINGS.map.popBfNone}</span>`
  const bfRow = `<div class="ev-pop-line bf"><span class="k">${STRINGS.map.popBfLabel}</span><span class="ev-bf-wrap">${bfText}</span></div>`

  const dLine = distanceLine(origin, f.lng, f.lat)
  const distRow = dLine ? `<div class="ev-pop-dist">${esc(dLine)}</div>` : ''

  return (
    `<div class="ev-pop">` +
    `<div class="ev-pop-kind" style="color:${kindColor}"><span class="dot" style="background:${kindColor}"></span>${kindWord}</div>` +
    `<div class="ev-pop-name">${esc(f.name)}</div>` +
    `<div class="ev-pop-addr">${esc(f.address)}</div>` +
    distRow +
    disasterRow +
    bfRow +
    `</div>`
  )
}

/**
 * 画面いっぱいの避難先マップ。
 * 地理院淡色ベース＋ハザードPMTiles（地域危険度/浸水/津波/高潮）を災害種別タブで排他表示。
 * さらに避難場所（緑・災害タブ連動フィルタ）と避難所（青・生活避難）をGeoJSONピンで重ねる。
 * わが家マーカー・凡例・出典・最寄りリストを重ねる。本番のRange非対応環境では
 * ハザードのヘッダーfetchが失敗するためハザードレイヤーは出ないが、
 * 避難先GeoJSONはRange不要の通常fetchなので常に表示できる。
 */
export function MapView() {
  const coords = usePlanStore((s) => s.coords)
  const risk = usePlanStore((s) => s.risk)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const homeMarkerRef = useRef<maplibregl.Marker | null>(null)
  const styleReadyRef = useRef(false)
  // ポップアップは常に1つに保つ（リストタップ／ピンクリックで使い回す）。
  const popupRef = useRef<maplibregl.Popup | null>(null)
  // 初期化effect内から最新のcoordsを参照するためのref（StrictMode再マウント対策）。
  const coordsRef = useRef(coords)
  coordsRef.current = coords

  const [hazard, setHazard] = useState<HazardKey>('quake')
  // 地図ロード完了ハンドラ等の「古いクロージャ」から最新のタブ値を読むためのref。
  // これが無いと、ロード中にタブを切り替えても初期値（地震）でレイヤーが適用される（レビューM-2）。
  const hazardRef = useRef(hazard)
  hazardRef.current = hazard
  const [layerState, setLayerState] = useState<LayerLoadState>('idle')
  /** 各ハザードのタイル利用可否（ヘッダーfetch成功=true）。未判定はundefined。 */
  const availRef = useRef<Partial<Record<HazardKey, boolean>>>({})

  // 避難場所・避難所（読み込み後にstateへ。最寄りリストとポップアップ計算に使う）。
  const [areas, setAreas] = useState<Facility[] | null>(null)
  const [centers, setCenters] = useState<Facility[] | null>(null)
  // ポップアップの距離計算で最新coordsを使うためのref。
  const originRef = useRef<{ lng: number; lat: number } | null>(
    coords ? { lng: coords.lng, lat: coords.lat } : null,
  )
  originRef.current = coords ? { lng: coords.lng, lat: coords.lat } : null

  // --- PMTilesカスタムプロトコル登録（マウント時に一度だけ） ---
  // W3: キャッシュ対応ソース（offlineTiles.ts）の共有インスタンスを登録する。
  // 地図の通常表示も同じソースを通るため、見た範囲＋プリキャッシュ済み範囲がオフラインで出る。
  useEffect(() => {
    const protocol = new Protocol()
    registerHazardProtocol(protocol)
    maplibregl.addProtocol('pmtiles', protocol.tile)
    return () => {
      maplibregl.removeProtocol('pmtiles')
    }
  }, [])

  // --- 避難場所・避難所データの読み込み（マウント時） ---
  useEffect(() => {
    let alive = true
    void loadAreas()
      .then((a) => {
        if (alive) setAreas(a)
      })
      .catch((e) => {
        console.error('load areas failed:', e)
      })
    void loadCenters()
      .then((c) => {
        if (alive) setCenters(c)
      })
      .catch((e) => {
        console.error('load centers failed:', e)
      })
    return () => {
      alive = false
    }
  }, [])

  // --- 地図の初期化（地理院淡色ベースのみ。ハザード・避難先は後段で追加） ---
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          gsi_pale: {
            type: 'raster',
            tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 18,
            attribution:
              '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院</a>',
          },
        },
        layers: [{ id: 'gsi_pale_layer', type: 'raster', source: 'gsi_pale' }],
      },
      center: coords ? [coords.lng, coords.lat] : INITIAL_CENTER,
      zoom: coords ? HOME_ZOOM : INITIAL_ZOOM,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    )

    // わが家マーカーは地図ライフサイクルに紐づけて生成（StrictModeの再マウントでも確実に付く）。
    const c = coordsRef.current
    if (c) {
      const el = document.createElement('div')
      el.className = 'home-pin'
      el.setAttribute('aria-label', 'わが家の位置')
      el.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="tag">自宅</span>'
      homeMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([c.lng, c.lat])
        .addTo(map)
    }

    // 地図の初期化ウォッチドッグ：一定時間内に load が来なければ「配信準備中」に落とす。
    // ベース地図の初期化自体が失敗する環境でも、無言の真っ白ではなく案内を出すための保険。
    const loadWatchdog = window.setTimeout(() => {
      if (!styleReadyRef.current) {
        if (!hasLoggedDegrade) {
          hasLoggedDegrade = true
          console.info(
            '[ヤタガラス] 地図エンジンの初期化がタイムアウトしました。ベース地図なしで案内のみ表示します。',
          )
        }
        setLayerState('degraded')
      }
    }, MAP_LOAD_TIMEOUT_MS)

    map.on('load', () => {
      window.clearTimeout(loadWatchdog)
      styleReadyRef.current = true
      map.resize() // 初期化時にコンテナ高さが未確定でも確実に合わせる
      // ハザード（非同期プローブ込み）の追加完了を待ってから避難先ピンを重ねる。
      // 並行追加だと実際の追加順が逆転し、塗りがピンの上に乗る（レビューM-3）。
      void (async () => {
        await addHazardLayers(map)
        // await中にタブ切替等でunmountされていたら破棄済みmapに触らない（レビューM-13）
        if (mapRef.current !== map) return
        addEvacuationLayers(map)
      })()
    })

    // コンテナのサイズ変化（タブ表示直後や端末回転）に追従してリサイズ。
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(mapContainerRef.current)

    mapRef.current = map
    return () => {
      window.clearTimeout(loadWatchdog)
      ro.disconnect()
      popupRef.current?.remove()
      popupRef.current = null
      map.remove()
      mapRef.current = null
      homeMarkerRef.current = null
      styleReadyRef.current = false
      availRef.current = {}
    }
    // coordsは初期center/マーカー決定のみに使用（後続の追従は別effect）。マウント時に初期化する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- coords変化時：マーカー位置を更新しflyTo（判定済みで地図を開いたときの追従） ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || !coords) return

    if (homeMarkerRef.current) {
      homeMarkerRef.current.setLngLat([coords.lng, coords.lat])
    } else {
      const el = document.createElement('div')
      el.className = 'home-pin'
      el.setAttribute('aria-label', 'わが家の位置')
      el.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="tag">自宅</span>'
      homeMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map)
    }

    const doFly = () =>
      map.flyTo({ center: [coords.lng, coords.lat], zoom: HOME_ZOOM, duration: 800 })
    if (styleReadyRef.current) doFly()
    else map.once('load', doFly)
  }, [coords])

  /**
   * ハザードPMTiles群を追加する。
   * 各ファイルを「配信可否」プローブで検証し、実体がPMTilesのものだけ source+layer を追加。
   * 1件でも失敗（=Range非対応環境／SPAフォールバックのHTMLが返る等）したら
   * バナーを出す（コンソールにはinfoを1回だけ）。
   */
  async function addHazardLayers(map: maplibregl.Map) {
    setLayerState('loading')
    let anyOk = false
    let anyFail = false

    for (const h of HAZARDS) {
      const url = `${TILES_BASE_URL}/${h.file}`
      // W3: プリキャッシュ済み（ヘッダーRangeがCacheにある）ならオフラインでも表示可能なので
      // ネットワークプローブを省略してOK扱いにする。未キャッシュ時のみ従来のRangeプローブ。
      const ok = (await hasCachedHeader(url)) || (await probePmtiles(url))
      // await中のunmountで破棄済みmapに触らない（レビューM-13）
      if (mapRef.current !== map) return
      if (ok) {
        availRef.current[h.key] = true
        anyOk = true
        const sourceId = `hz-${h.key}`
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: 'vector', url: `pmtiles://${url}` })
        }
        addHazardStyleLayers(map, h.key, sourceId, h.sourceLayer)
      } else {
        availRef.current[h.key] = false
        anyFail = true
      }
    }

    if (anyFail && !hasLoggedDegrade) {
      hasLoggedDegrade = true
      // 未捕捉エラーを出さず、情報ログを1回だけ。
      console.info(
        '[ヤタガラス] 一部/全てのハザードタイルを配信環境から取得できませんでした（Range非対応の可能性）。ベース地図のみ表示します。',
      )
    }

    setLayerState(anyOk ? 'ready' : 'degraded')
    // 最新のタブ値で適用（ロード中にタブが切り替わっていても正しいレイヤーを出す。レビューM-2）
    applyHazardVisibility(map, hazardRef.current)
  }

  /** 指定ハザードのスタイルレイヤーを追加（重複追加は避ける）。初期は非表示。 */
  function addHazardStyleLayers(
    map: maplibregl.Map,
    key: HazardKey,
    sourceId: string,
    sourceLayer: string,
  ) {
    const fillId = `${sourceId}-fill`
    const lineId = `${sourceId}-line`
    if (map.getLayer(fillId)) return

    if (key === 'quake') {
      // 地域危険度：総合ランクでポリゴン塗り分け＋細い境界線。
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        'source-layer': sourceLayer,
        layout: { visibility: 'none' },
        paint: {
          'fill-color': rankColorExpression('総合_ラ'),
          'fill-opacity': RISK_FILL_OPACITY,
        },
      })
      map.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        'source-layer': sourceLayer,
        layout: { visibility: 'none' },
        paint: { 'line-color': 'rgba(20,30,50,0.25)', 'line-width': 0.4 },
      })
    } else if (key === 'storm') {
      // 高潮：ポリゴン、深さ(DepthM)で段階色。
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        'source-layer': sourceLayer,
        layout: { visibility: 'none' },
        paint: {
          'fill-color': depthColorExpression('DepthM'),
          'fill-opacity': DEPTH_OPACITY,
        },
      })
    } else {
      // 浸水(shinsui)・津波(tsunami)：ポイント、深さ(depth_m)で段階色の円。
      map.addLayer({
        id: fillId,
        type: 'circle',
        source: sourceId,
        'source-layer': sourceLayer,
        layout: { visibility: 'none' },
        paint: {
          'circle-color': depthColorExpression('depth_m'),
          'circle-opacity': DEPTH_OPACITY,
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8, 1.5,
            12, 4,
            14, 7,
          ],
          'circle-stroke-width': 0,
        },
      })
    }
  }

  /**
   * 避難先GeoJSON（避難場所＝緑／避難所＝青）を追加する。
   * PMTilesと違いRange不要の通常fetchなので、本番でも常に読み込める。
   * ハザードレイヤーの「上」に重ねてピンが隠れないようにする。
   * 避難場所は災害タブに応じてフィルタ、避難所は常時表示（生活避難）。
   */
  function addEvacuationLayers(map: maplibregl.Map) {
    // --- 避難所（青）：先に追加して避難場所の下に敷く ---
    if (!map.getSource(SRC_CENTERS)) {
      map.addSource(SRC_CENTERS, { type: 'geojson', data: CENTERS_URL })
    }
    if (!map.getLayer(LYR_CENTERS)) {
      map.addLayer({
        id: LYR_CENTERS,
        type: 'circle',
        source: SRC_CENTERS,
        paint: {
          'circle-color': CENTER_COLOR,
          'circle-opacity': 0.85,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 13, 4.5, 16, 8],
          'circle-stroke-width': 1.2,
          'circle-stroke-color': '#ffffff',
        },
      })
    }

    // --- 避難場所（緑）：上に重ねる。災害タブでフィルタ ---
    if (!map.getSource(SRC_AREAS)) {
      map.addSource(SRC_AREAS, { type: 'geojson', data: AREAS_URL })
    }
    if (!map.getLayer(LYR_AREAS)) {
      map.addLayer({
        id: LYR_AREAS,
        type: 'circle',
        source: SRC_AREAS,
        paint: {
          'circle-color': AREA_COLOR,
          'circle-opacity': 0.9,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 13, 5.5, 16, 9],
          'circle-stroke-width': 1.4,
          'circle-stroke-color': '#ffffff',
        },
      })
    }
    applyAreaFilter(map, hazardRef.current)

    // クリック（ピン→ポップアップ）とカーソル。参照安定なハンドラで1回だけ登録。
    map.on('click', LYR_AREAS, areaClickHandler)
    map.on('click', LYR_CENTERS, centerClickHandler)
    map.on('mouseenter', LYR_AREAS, cursorPointer)
    map.on('mouseleave', LYR_AREAS, cursorDefault)
    map.on('mouseenter', LYR_CENTERS, cursorPointer)
    map.on('mouseleave', LYR_CENTERS, cursorDefault)
  }

  /** 避難場所レイヤーに「現在の災害タブに対応するもの」だけを残すフィルタを適用。 */
  function applyAreaFilter(map: maplibregl.Map, active: HazardKey) {
    if (!map.getLayer(LYR_AREAS)) return
    const flagProp: Record<HazardKey, string> = {
      quake: 'earthquake',
      flood: 'flood',
      tsunami: 'tsunami',
      storm: 'storm_surge',
    }
    // 該当フラグが true のフィーチャだけ表示。
    map.setFilter(LYR_AREAS, ['==', ['get', flagProp[active]], true])
  }

  // 避難場所ピンのクリック → ポップアップ。
  const areaClickHandler = useMemo(
    () => (e: maplibregl.MapLayerMouseEvent) => showFacilityPopupFromEvent(e, 'area'),
    [],
  )
  // 避難所ピンのクリック → ポップアップ。
  const centerClickHandler = useMemo(
    () => (e: maplibregl.MapLayerMouseEvent) => showFacilityPopupFromEvent(e, 'center'),
    [],
  )

  /** クリックイベントのfeatureプロパティからFacilityを組み、ポップアップを出す。 */
  function showFacilityPopupFromEvent(e: maplibregl.MapLayerMouseEvent, kind: 'area' | 'center') {
    const map = mapRef.current
    if (!map) return
    const feat = e.features?.[0]
    if (!feat) return
    const p = feat.properties as Record<string, unknown>
    const [lng, lat] = (feat.geometry as GeoJSON.Point).coordinates as [number, number]
    const f: Facility = {
      kind,
      name: String(p.name ?? ''),
      ward: String(p.ward ?? ''),
      address: String(p.address ?? ''),
      lng,
      lat,
      bf: {
        wheelchair_toilet: p.wheelchair_toilet === true ? true : null,
        elevator_or_1f: p.elevator_or_1f === true ? true : null,
        braille_block: p.braille_block === true ? true : null,
        slope: p.slope === true ? true : null,
      },
      disasters:
        kind === 'area'
          ? {
              earthquake: p.earthquake === true,
              flood: p.flood === true,
              tsunami: p.tsunami === true,
              storm_surge: p.storm_surge === true,
              inland_flood: p.inland_flood === true,
              landslide: p.landslide === true,
              fire: p.fire === true,
              volcano: p.volcano === true,
            }
          : undefined,
    }
    openFacilityPopup(f, [lng, lat])
  }

  /** 施設ポップアップを（使い回しの単一Popupで）開く。 */
  function openFacilityPopup(f: Facility, lngLat: [number, number]) {
    const map = mapRef.current
    if (!map) return
    const html = facilityPopupHTML(f, originRef.current)
    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 10, maxWidth: '260px' })
    }
    popupRef.current.setLngLat(lngLat).setHTML(html).addTo(map)
  }

  const cursorPointer = useMemo(
    () => () => {
      const m = mapRef.current
      if (m) m.getCanvas().style.cursor = 'pointer'
    },
    [],
  )
  const cursorDefault = useMemo(
    () => () => {
      const m = mapRef.current
      if (m) m.getCanvas().style.cursor = ''
    },
    [],
  )

  /** 表示中の災害種別だけを可視化（排他）。 */
  function applyHazardVisibility(map: maplibregl.Map, active: HazardKey) {
    for (const h of HAZARDS) {
      const on = h.key === active
      for (const suffix of ['-fill', '-line']) {
        const id = `hz-${h.key}${suffix}`
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
        }
      }
    }
    setupQuakePopup(map, active)
  }

  /** 地震タブのときだけ町丁目クリックポップアップを有効化。 */
  function setupQuakePopup(map: maplibregl.Map, active: HazardKey) {
    const fillId = 'hz-quake-fill'
    if (!map.getLayer(fillId)) return
    // 常にハンドラは1つ。activeに応じて内部で分岐。
    map.off('click', fillId, quakeClickHandler)
    map.off('mouseenter', fillId, cursorPointer)
    map.off('mouseleave', fillId, cursorDefault)
    if (active === 'quake') {
      map.on('click', fillId, quakeClickHandler)
      map.on('mouseenter', fillId, cursorPointer)
      map.on('mouseleave', fillId, cursorDefault)
    }
  }

  // 町丁目（地域危険度）クリックポップアップ。避難先ポップアップと同じ単一Popupを使う。
  const quakeClickHandler = useMemo(
    () => (e: maplibregl.MapLayerMouseEvent) => {
      const map = mapRef.current
      if (!map) return
      const f = e.features?.[0]
      if (!f) return
      const p = f.properties as Record<string, unknown>
      const town = (p['町丁目名'] as string) ?? ''
      const ward = (p['区市町村名'] as string) ?? ''
      const rank = Number(p['総合_ラ'])
      const color = RANK_COLOR[rank] ?? '#888'
      const html =
        `<div class="hz-pop">` +
        `<div class="hz-pop-t">${esc(ward)} ${esc(town)}</div>` +
        `<div class="hz-pop-r"><span class="hz-pop-sw" style="background:${color}"></span>` +
        `総合危険度 ランク${Number.isFinite(rank) ? rank : '—'}</div>` +
        `</div>`
      if (!popupRef.current) {
        popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 8, maxWidth: '240px' })
      }
      popupRef.current.setLngLat(e.lngLat).setHTML(html).addTo(map)
    },
    [],
  )

  // --- タブ切替でレイヤー可視性＋避難場所フィルタを更新 ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleReadyRef.current) return
    applyHazardVisibility(map, hazard)
    applyAreaFilter(map, hazard)
    // applyHazardVisibility/applyAreaFilterは安定参照でないため依存にhazardのみ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hazard])

  // 現在タブが津波で、わが家が本土（＝データ範囲外）なら注記を出す。
  const showTsunamiMainlandNote =
    hazard === 'tsunami' && availRef.current['tsunami'] === true

  const activeHaz = HAZARDS.find((h) => h.key === hazard)!

  // --- 最寄りリスト（現在タブの避難場所 最寄り3件＋最寄り避難所1件） ---
  const origin = coords ? { lng: coords.lng, lat: coords.lat } : null
  const nearAreas: FacilityWithDistance[] = useMemo(() => {
    if (!origin || !areas) return []
    const filtered = filterAreasByHazard(areas, hazard)
    return nearest(origin, filtered, NEAR_AREA_COUNT)
    // originは毎レンダ新規オブジェクトになるためcoordsを依存に使う。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, areas, hazard])
  const nearCenter: FacilityWithDistance | null = useMemo(() => {
    if (!origin || !centers) return null
    return nearestOne(origin, centers)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, centers])

  /** リスト項目タップ → flyTo＋ポップアップ。 */
  function handleListItemClick(f: FacilityWithDistance) {
    const map = mapRef.current
    if (!map) return
    map.flyTo({ center: [f.lng, f.lat], zoom: PIN_ZOOM, duration: 800 })
    openFacilityPopup(f, [f.lng, f.lat])
  }

  /** 現在地（わが家）に地図を戻すFAB。 */
  function flyToHome() {
    const map = mapRef.current
    if (!map || !coords) return
    map.flyTo({ center: [coords.lng, coords.lat], zoom: HOME_ZOOM, duration: 800 })
  }

  return (
    <section aria-label="避難先マップ" className="map-screen">
      {/* 住所コンテキスト（R1：地図画面は「◯◯の避難先」を明示） */}
      <div className="map-context">
        {risk ? `${risk.ward} ${risk.town} の避難先` : STRINGS.map.sectionPrefix}
      </div>

      {/* 災害種別タブ（横スクロール・地図の上に独立配置） */}
      <div className="hazard-tabs" role="tablist" aria-label="災害の種類">
        {HAZARDS.map((h) => (
          <button
            key={h.key}
            role="tab"
            aria-selected={hazard === h.key}
            onClick={() => setHazard(h.key)}
          >
            {h.label}
          </button>
        ))}
      </div>

      <div className="map-wrap-live">
        <div ref={mapContainerRef} className="map-canvas-live" />

        {/* グレースフルデグレード・バナー（配信不可時のみ） */}
        {layerState === 'degraded' && (
          <div className="map-banner" role="status">
            <Icon name="info" size={15} />
            <span>{STRINGS.map.degradeBanner}</span>
          </div>
        )}

        {/* 津波（島しょ部データのみ）を本土で見たときの注記 */}
        {showTsunamiMainlandNote && (
          <div className="map-banner soft" role="status">
            <Icon name="info" size={15} />
            <span>{STRINGS.map.tsunamiMainlandNote}</span>
          </div>
        )}

        {/* 現在地（わが家）に戻るFAB */}
        {coords && (
          <button className="map-fab" aria-label="現在地に戻る" onClick={flyToHome}>
            <Icon name="location-current" size={22} />
          </button>
        )}
      </div>

      {/* 凡例（常設・地図下） */}
      <MapLegend hazard={hazard} label={activeHaz.label} />

      {/* 最寄り避難先リスト（現在タブの避難場所3件＋最寄り避難所1件） */}
      <div className="evac-list">
        <h2 className="h-sec">
          {STRINGS.map.nearListTitle(activeHaz.label)}
          <span className="sub">近い順</span>
        </h2>
        {nearAreas.length > 0 ? (
          <ul className="evac-items">
            {nearAreas.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <button className="evac-item" onClick={() => handleListItemClick(f)}>
                  <span className="ev-mark area" aria-hidden="true">
                    ▲
                  </span>
                  <span className="ev-body">
                    <span className="ev-name">{f.name}</span>
                    <span className="ev-kind">{STRINGS.map.evacAreaWord}（一時的に逃げる）</span>
                  </span>
                  <span className="ev-dist-wrap">
                    <span className="ev-dist area">{STRINGS.map.distFmt(f.distanceM, f.walkMin).split('・')[0]}</span>
                    <span className="ev-walk">{STRINGS.map.distFmt(f.distanceM, f.walkMin).split('・')[1]}</span>
                  </span>
                  <Icon name="chevron-right" size={16} className="ev-go" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="note-inline gray evac-empty">
            <Icon name="info" size={15} />
            <span>{STRINGS.map.nearListEmpty(activeHaz.label)}</span>
          </div>
        )}

        {/* 参考：最寄りの避難所（生活避難）を1件だけ区別表示 */}
        {nearCenter && (
          <ul className="evac-items">
            <li>
              <button className="evac-item" onClick={() => handleListItemClick(nearCenter)}>
                <span className="ev-mark center" aria-hidden="true">
                  ■
                </span>
                <span className="ev-body">
                  <span className="ev-name">{nearCenter.name}</span>
                  <span className="ev-kind">{STRINGS.map.evacCenterWord}（生活する）</span>
                </span>
                <span className="ev-dist-wrap">
                  <span className="ev-dist center">{STRINGS.map.distFmt(nearCenter.distanceM, nearCenter.walkMin).split('・')[0]}</span>
                  <span className="ev-walk">{STRINGS.map.distFmt(nearCenter.distanceM, nearCenter.walkMin).split('・')[1]}</span>
                </span>
                <Icon name="chevron-right" size={16} className="ev-go" />
              </button>
            </li>
          </ul>
        )}
        <p className="evac-walknote">
          <Icon name="info" size={15} />
          <span>{STRINGS.map.walkNote}</span>
        </p>
      </div>

      {/* 出典表記 */}
      <div className="disclaimer map-src">
        <p>{STRINGS.map.attribution}</p>
      </div>
    </section>
  )
}

/**
 * 表示中の災害種別に応じた凡例（R1：地図下の常設バー）。
 * 避難先ピン（避難場所＝緑丸▲／避難所＝青四角■／自宅＝青白縁丸）を常時掲載し、
 * ハザードのランク／深さ凡例も同バー内に折り返し掲載する。
 * 「空欄＝情報なし」の注記も維持（色覚配慮・凡例注記）。
 */
function MapLegend({ hazard, label }: { hazard: HazardKey; label: string }) {
  const isQuake = hazard === 'quake'
  return (
    <div className="map-legend" aria-label={`凡例：${label}`}>
      {/* 避難先ピン凡例（形状でも符号化） */}
      <span className="lg-row">
        <span className="sw area" style={{ background: AREA_COLOR }} aria-hidden="true" />▲{' '}
        {STRINGS.map.legendEvacArea}
      </span>
      <span className="lg-row">
        <span className="sw center" style={{ background: CENTER_COLOR }} aria-hidden="true" />■{' '}
        {STRINGS.map.legendEvacCenter}
      </span>
      <span className="lg-row">
        <span className="sw you" aria-hidden="true" />
        {STRINGS.map.legendYou}
      </span>
      {/* ハザードのランク／深さ凡例 */}
      {isQuake ? (
        <span className="lg-full">
          <b>{STRINGS.map.quakeLegendTitle}：</b>
          {[1, 2, 3, 4, 5].map((r) => (
            <span key={r} className="lg-row" style={{ marginLeft: r === 1 ? 6 : 10 }}>
              <span className="sw center" style={{ background: RANK_COLOR[r] }} aria-hidden="true" />
              {r}
              {r === 5 ? '（高）' : r === 1 ? '（低）' : ''}
            </span>
          ))}
        </span>
      ) : (
        <span className="lg-full">
          <b>{STRINGS.map.depthLegendTitle}：</b>
          {DEPTH_LEGEND.map((d) => (
            <span key={d.label} className="lg-row" style={{ marginLeft: 8 }}>
              <span className="sw center" style={{ background: d.color }} aria-hidden="true" />
              {d.label}
            </span>
          ))}
        </span>
      )}
      <span className="lg-full">{STRINGS.map.legendNoData}</span>
    </div>
  )
}

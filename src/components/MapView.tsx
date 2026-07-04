import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import { usePlanStore } from '../store/usePlanStore'
import {
  STRINGS,
  TILES_BASE_URL,
  HAZARDS,
  RANK_COLOR,
  DEPTH_STEPS,
  DEPTH_LEGEND,
  type HazardKey,
} from '../lib/constants'

/** 東京都心（皇居付近）を初期表示範囲とする。 */
const INITIAL_CENTER: [number, number] = [139.75, 35.69]
const INITIAL_ZOOM = 11
/** わが家判定済みで開いたときのflyTo先ズーム。 */
const HOME_ZOOM = 13

/** 危険度ポリゴンの塗り透明度。 */
const RISK_FILL_OPACITY = 0.55
/** 浸水系の塗り/円の透明度。 */
const DEPTH_OPACITY = 0.6

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

/**
 * 画面いっぱいの避難先マップ。
 * 地理院淡色ベース＋ハザードPMTiles（地域危険度/浸水/津波/高潮）を災害種別タブで排他表示。
 * わが家マーカー・凡例・出典を重ねる。本番のRange非対応環境では
 * ハザードのヘッダーfetchが失敗するため、レイヤーを読み込まずバナーを出す（グレースフルデグレード）。
 */
export function MapView() {
  const coords = usePlanStore((s) => s.coords)
  const risk = usePlanStore((s) => s.risk)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const homeMarkerRef = useRef<maplibregl.Marker | null>(null)
  const styleReadyRef = useRef(false)
  // 初期化effect内から最新のcoordsを参照するためのref（StrictMode再マウント対策）。
  const coordsRef = useRef(coords)
  coordsRef.current = coords

  const [hazard, setHazard] = useState<HazardKey>('quake')
  const [layerState, setLayerState] = useState<LayerLoadState>('idle')
  /** 各ハザードのタイル利用可否（ヘッダーfetch成功=true）。未判定はundefined。 */
  const availRef = useRef<Partial<Record<HazardKey, boolean>>>({})

  // --- PMTilesカスタムプロトコル登録（マウント時に一度だけ） ---
  useEffect(() => {
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)
    return () => {
      maplibregl.removeProtocol('pmtiles')
    }
  }, [])

  // --- 地図の初期化（地理院淡色ベースのみ。ハザードは後段で追加） ---
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
      el.innerHTML = '<span aria-hidden="true">🏠</span>'
      homeMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([c.lng, c.lat])
        .addTo(map)
    }

    map.on('load', () => {
      styleReadyRef.current = true
      map.resize() // 初期化時にコンテナ高さが未確定でも確実に合わせる
      void addHazardLayers(map)
    })

    // コンテナのサイズ変化（タブ表示直後や端末回転）に追従してリサイズ。
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(mapContainerRef.current)

    mapRef.current = map
    return () => {
      ro.disconnect()
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
      el.innerHTML = '<span aria-hidden="true">🏠</span>'
      homeMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
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
      const ok = await probePmtiles(url)
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
        '[YATA GUIDE] 一部/全てのハザードタイルを配信環境から取得できませんでした（Range非対応の可能性）。ベース地図のみ表示します。',
      )
    }

    setLayerState(anyOk ? 'ready' : 'degraded')
    applyHazardVisibility(map, hazard)
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

  // ポップアップ・カーソル用ハンドラ（参照安定のためコンポーネント内で保持）。
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
        `<div class="hz-pop-t">${ward} ${town}</div>` +
        `<div class="hz-pop-r"><span class="hz-pop-sw" style="background:${color}"></span>` +
        `総合危険度 ランク${Number.isFinite(rank) ? rank : '—'}</div>` +
        `</div>`
      new maplibregl.Popup({ closeButton: true, offset: 8, maxWidth: '240px' })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map)
    },
    [],
  )
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

  // --- タブ切替でレイヤー可視性を更新 ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || !styleReadyRef.current) return
    applyHazardVisibility(map, hazard)
    // applyHazardVisibilityは安定参照でないため依存にhazardのみ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hazard])

  // 現在タブが津波で、わが家が本土（＝データ範囲外）なら注記を出す。
  const showTsunamiMainlandNote =
    hazard === 'tsunami' && availRef.current['tsunami'] === true

  const activeHaz = HAZARDS.find((h) => h.key === hazard)!

  return (
    <section aria-label="避難先マップ" className="map-screen">
      <div className="section-label">
        {STRINGS.map.sectionPrefix}
        {risk ? ` ／ ${risk.ward} ${risk.town} 周辺` : ''}
      </div>

      <div className="map-wrap-live">
        <div ref={mapContainerRef} className="map-canvas-live" />

        {/* 災害種別タブ（排他切替・44pxタップターゲット） */}
        <div className="hazard-tabs" role="tablist" aria-label="災害種別">
          {HAZARDS.map((h) => (
            <button
              key={h.key}
              role="tab"
              aria-selected={hazard === h.key}
              aria-pressed={hazard === h.key}
              onClick={() => setHazard(h.key)}
            >
              <span className="ic" aria-hidden="true">
                {h.icon}
              </span>
              {h.label}
            </button>
          ))}
        </div>

        {/* グレースフルデグレード・バナー（配信不可時のみ） */}
        {layerState === 'degraded' && (
          <div className="map-banner" role="status">
            <span className="i" aria-hidden="true">
              ⓘ
            </span>
            <span>{STRINGS.map.degradeBanner}</span>
          </div>
        )}

        {/* 津波（島しょ部データのみ）を本土で見たときの注記 */}
        {showTsunamiMainlandNote && (
          <div className="map-banner soft" role="status">
            <span className="i" aria-hidden="true">
              ⓘ
            </span>
            <span>{STRINGS.map.tsunamiMainlandNote}</span>
          </div>
        )}

        {/* 凡例（表示中レイヤーに応じて内容を切替） */}
        <MapLegend hazard={hazard} label={activeHaz.label} />
      </div>

      {/* 出典表記 */}
      <div className="disclaimer map-src">
        <p>{STRINGS.map.attribution}</p>
      </div>
    </section>
  )
}

/** 表示中の災害種別に応じた凡例。 */
function MapLegend({ hazard, label }: { hazard: HazardKey; label: string }) {
  const isQuake = hazard === 'quake'
  return (
    <div className="map-legend" aria-label={`凡例：${label}`}>
      <div className="lg-t">
        {STRINGS.map.legendTitle}・{label}
      </div>
      {isQuake ? (
        <>
          <div className="lg-sub">{STRINGS.map.quakeLegendTitle}</div>
          {[5, 4, 3, 2, 1].map((r) => (
            <div className="lg-row" key={r}>
              <span className="sw" style={{ background: RANK_COLOR[r] }} />
              ランク{r}
              {r === 5 ? '（高）' : r === 1 ? '（低）' : ''}
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="lg-sub">{STRINGS.map.depthLegendTitle}</div>
          {DEPTH_LEGEND.map((d) => (
            <div className="lg-row" key={d.label}>
              <span className="sw" style={{ background: d.color }} />
              {d.label}
            </div>
          ))}
        </>
      )}
      <div className="lg-row you">
        <span className="sw pin-sw" />
        {STRINGS.map.legendYou}
      </div>
      <div className="lg-note">{STRINGS.map.legendNoData}</div>
    </div>
  )
}

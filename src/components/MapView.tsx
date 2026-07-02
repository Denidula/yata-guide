import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { PMTiles, Protocol } from 'pmtiles'

/** 動作検証用の公開PMTilesデモファイル（Protomaps提供）。本物の危険度PMTilesはT5で作成予定。 */
const PMTILES_DEMO_URL = 'https://demo-bucket.protomaps.com/v4.pmtiles'

/** 東京都心を初期表示範囲とする */
const INITIAL_CENTER: [number, number] = [139.75, 35.69]
const INITIAL_ZOOM = 11

type PmtilesStatus = 'checking' | 'ok' | 'ng'

/**
 * 画面いっぱいの地図。地理院淡色タイルを背景に表示し、
 * PMTilesカスタムプロトコルが機能しているかを画面隅に小さく表示する。
 */
export function MapView() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [pmtilesStatus, setPmtilesStatus] = useState<PmtilesStatus>('checking')

  // PMTilesカスタムプロトコルの登録（マウント時に一度だけ）
  useEffect(() => {
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)

    return () => {
      maplibregl.removeProtocol('pmtiles')
    }
  }, [])

  // 地図の初期化
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          gsi_pale: {
            type: 'raster',
            tiles: ['https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 18,
            attribution: '国土地理院',
          },
        },
        layers: [
          {
            id: 'gsi_pale_layer',
            type: 'raster',
            source: 'gsi_pale',
          },
        ],
      },
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: false },
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // PMTilesプロトコル動作確認：デモファイルのヘッダー/メタデータ取得を試みる
  useEffect(() => {
    let cancelled = false

    const checkPmtiles = async () => {
      try {
        const pmtiles = new PMTiles(PMTILES_DEMO_URL)
        const header = await pmtiles.getHeader()
        if (cancelled) return
        if (header && typeof header.tileType !== 'undefined') {
          setPmtilesStatus('ok')
        } else {
          setPmtilesStatus('ng')
        }
      } catch (error) {
        console.error('PMTiles protocol check failed:', error)
        if (!cancelled) setPmtilesStatus('ng')
      }
    }

    checkPmtiles()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      <PmtilesStatusBadge status={pmtilesStatus} />
    </div>
  )
}

function PmtilesStatusBadge({ status }: { status: PmtilesStatus }) {
  const label =
    status === 'checking' ? 'PMTiles: ...' : status === 'ok' ? 'PMTiles: OK' : 'PMTiles: NG'

  const colorClass =
    status === 'checking'
      ? 'bg-slate-500/80 text-white'
      : status === 'ok'
        ? 'bg-emerald-600/90 text-white'
        : 'bg-red-600/90 text-white'

  return (
    <div
      className={`absolute bottom-2 right-2 rounded px-2 py-1 text-[10px] font-mono shadow ${colorClass}`}
      title={`カスタムプロトコル検証用デモファイル: ${PMTILES_DEMO_URL}`}
    >
      {label}
    </div>
  )
}

import { create } from 'zustand'
import { geocode } from '../lib/geocode'
import { locateChomoku } from '../lib/pip'
import { resolveRisk, type RiskInfo } from '../lib/risk'

/** 座標＋ジオコーディング精度。 */
export interface Coords {
  lat: number
  lng: number
  /** 位置情報の精度レベル（8=街区・地番, ≤3=代表点） */
  level: number
  /** true=高精度, false=丁目代表点相当 */
  precise: boolean
}

/** 画面状態。 */
export type UiStatus =
  | { kind: 'idle' }
  | { kind: 'locating' } // ジオコーディング〜PIP〜リスク解決中
  | { kind: 'ready' } // 危険度カード表示可能
  | { kind: 'error'; code: ErrorCode }

export type ErrorCode =
  | 'geocode_failed' // ジオコーディング両系失敗
  | 'out_of_area' // PIP判定対象外（島しょ部等）
  | 'geo_denied' // 位置情報の許可拒否／取得失敗
  | 'geo_unavailable' // Geolocation非対応
  | 'generic'

export type LocationSource = 'input' | 'gps' | 'demo'

/**
 * 下部タブバーの表示ビュー。
 * uiStatus（判定フローの状態）とは独立に、タブでの画面切替を表す。
 * - home: ホーム／住所入力（またはlocating/error）
 * - card: 危険度カード（risk確定時のみ到達可能）
 * - map:  避難先マップ（risk確定時のみ到達可能）
 */
export type AppView = 'home' | 'card' | 'map'

export interface PlanState {
  /** 下部タブの表示ビュー */
  view: AppView
  /** 住所入力欄の現在値（未確定） */
  addressInput: string
  /** 確定した住所文字列（ヘッダー表示用） */
  address: string | null
  /** 確定した座標 */
  coords: Coords | null
  /** 確定した町丁目ID */
  chomokuId: number | null
  /** 解決したリスク情報 */
  risk: RiskInfo | null
  /** 画面状態 */
  uiStatus: UiStatus
  /** どの手段で地点が決まったか */
  source: LocationSource | null

  setAddressInput: (value: string) => void
  /** タブでビューを切り替える（card/mapはrisk確定時のみ有効）。 */
  setView: (view: AppView) => void
  /** 住所文字列から判定（入力 or デモchip）。 */
  resolveByAddress: (address: string, source: LocationSource) => Promise<void>
  /** 緯度経度から直接判定（現在地ボタン）。 */
  resolveByCoords: (lat: number, lng: number) => Promise<void>
  /** 位置情報エラーをセット。 */
  setGeoError: (code: ErrorCode) => void
  /** ホームへ戻す（結果クリア）。 */
  backToHome: () => void
  reset: () => void
}

const initialState = {
  view: 'home' as AppView,
  addressInput: '',
  address: null,
  coords: null,
  chomokuId: null,
  risk: null,
  uiStatus: { kind: 'idle' } as UiStatus,
  source: null,
}

/** 座標→PIP→リスク解決の共通処理。状態を確定させる。 */
async function resolveFromCoords(
  set: (partial: Partial<PlanState>) => void,
  lat: number,
  lng: number,
  coords: Coords,
  address: string,
  source: LocationSource,
) {
  const pip = await locateChomoku(lng, lat)
  if (!pip) {
    set({ uiStatus: { kind: 'error', code: 'out_of_area' } })
    return
  }
  const risk = await resolveRisk(pip.chomokuId)
  if (!risk) {
    set({ uiStatus: { kind: 'error', code: 'out_of_area' } })
    return
  }
  set({
    address,
    coords,
    chomokuId: pip.chomokuId,
    risk,
    source,
    uiStatus: { kind: 'ready' },
    view: 'card', // 判定完了で危険度カードへ
  })
}

/**
 * 避難計画フロー全体で共有するstate。
 * 住所/座標 → 町丁目ID → リスク解決 → 危険度カード表示。
 */
export const usePlanStore = create<PlanState>((set) => ({
  ...initialState,

  setAddressInput: (value) => set({ addressInput: value }),

  setView: (view) => set({ view }),

  resolveByAddress: async (address, source) => {
    set({ uiStatus: { kind: 'locating' } })
    try {
      const g = await geocode(address)
      if (!g) {
        set({ uiStatus: { kind: 'error', code: 'geocode_failed' } })
        return
      }
      const coords: Coords = { lat: g.lat, lng: g.lng, level: g.level, precise: g.precise }
      // 表示住所は正規化結果があればそれ、無ければ入力そのまま
      await resolveFromCoords(set, g.lat, g.lng, coords, g.normalized || address, source)
    } catch (e) {
      console.error('resolveByAddress failed:', e)
      set({ uiStatus: { kind: 'error', code: 'generic' } })
    }
  },

  resolveByCoords: async (lat, lng) => {
    set({ uiStatus: { kind: 'locating' } })
    try {
      // 現在地はGPS実測なので高精度扱い
      const coords: Coords = { lat, lng, level: 8, precise: true }
      await resolveFromCoords(set, lat, lng, coords, '現在地', 'gps')
    } catch (e) {
      console.error('resolveByCoords failed:', e)
      set({ uiStatus: { kind: 'error', code: 'generic' } })
    }
  },

  setGeoError: (code) => set({ uiStatus: { kind: 'error', code } }),

  backToHome: () =>
    set({
      view: 'home',
      address: null,
      coords: null,
      chomokuId: null,
      risk: null,
      source: null,
      uiStatus: { kind: 'idle' },
    }),

  reset: () => set({ ...initialState }),
}))

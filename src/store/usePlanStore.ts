import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
  | 'geocode_offline' // オフラインで住所の新規検索に失敗（ネット必須の操作）
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
 * - plan: マイ避難計画（プロフィール入力＋計画カード。risk確定時のみ到達可能）
 * - map:  避難先マップ（risk確定時のみ到達可能）
 */
export type AppView = 'home' | 'card' | 'plan' | 'map'

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
  /**
   * 永続化された前回結果を復元して表示しているか。
   * true のときカードに「前回の判定結果」ラベルと再判定導線を出す。
   * この画面で新規判定すると false に戻す。
   */
  restoredFromStorage: boolean

  setAddressInput: (value: string) => void
  /** タブでビューを切り替える（card/mapはrisk確定時のみ有効）。 */
  setView: (view: AppView) => void
  /** 住所文字列から判定（入力 or デモchip）。 */
  resolveByAddress: (address: string, source: LocationSource) => Promise<void>
  /** 緯度経度から直接判定（現在地ボタン）。 */
  resolveByCoords: (lat: number, lng: number) => Promise<void>
  /** 位置情報エラーをセット。 */
  setGeoError: (code: ErrorCode) => void
  /**
   * 共有URLから受け取った計画を自分の判定結果として取り込む（W2）。
   * 受信端末でPIP→リスク再解決済みの値を渡す。取り込み後は計画タブを表示。
   */
  adoptShared: (address: string, coords: Coords, chomokuId: number, risk: RiskInfo) => void
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
  restoredFromStorage: false,
}

/**
 * 端末ストレージの永続化を要求する（iOS/A2HS対策）。
 * A2HS後の PWA でキャッシュ/localStorage が容量逼迫時に消えにくくなる。
 * ユーザー操作（初回判定成功）を起点に一度だけ呼ぶ。結果は console.info で記録。
 * 個人情報は送信せず端末内のみ（この関数もネットワークを一切使わない）。
 */
let persistRequested = false
async function requestPersistentStorage() {
  if (persistRequested) return
  persistRequested = true
  try {
    if (navigator.storage?.persist) {
      const granted = await navigator.storage.persist()
      console.info(`[YATA GUIDE] navigator.storage.persist() → ${granted ? 'granted' : 'denied'}`)
    } else {
      console.info('[YATA GUIDE] navigator.storage.persist() は非対応環境です')
    }
  } catch (e) {
    console.info('[YATA GUIDE] navigator.storage.persist() 呼び出しに失敗:', e)
  }
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
    restoredFromStorage: false, // 新規判定なので「前回結果」ラベルは外す
  })
  // 判定成功＝ユーザー操作のタイミングで永続化を要求（iOS/A2HS対策、初回のみ実行）。
  void requestPersistentStorage()
}

/**
 * 避難計画フロー全体で共有するstate。
 * 住所/座標 → 町丁目ID → リスク解決 → 危険度カード表示。
 *
 * persist: 最後の判定結果（address/coords/chomokuId/risk）だけを localStorage に保存し、
 * 再訪時に前回カードを即表示する。個人情報（入力住所・座標）は端末内のみに保持し、
 * 送信は一切行わない（設計原則）。入力途中の値や UI 状態は永続化しない。
 */
export const usePlanStore = create<PlanState>()(
  persist(
    (set) => ({
      ...initialState,

      setAddressInput: (value) => set({ addressInput: value }),

      setView: (view) => set({ view }),

      resolveByAddress: async (address, source) => {
        set({ uiStatus: { kind: 'locating' } })
        try {
          const g = await geocode(address)
          if (!g) {
            // オフライン時のジオコーディング失敗は専用メッセージで区別する
            // （既存キャッシュの正規化辞書で解けない新規住所はネット接続が必要）。
            const code: ErrorCode = navigator.onLine ? 'geocode_failed' : 'geocode_offline'
            set({ uiStatus: { kind: 'error', code } })
            return
          }
          const coords: Coords = { lat: g.lat, lng: g.lng, level: g.level, precise: g.precise }
          // 表示住所は正規化結果があればそれ、無ければ入力そのまま
          await resolveFromCoords(set, g.lat, g.lng, coords, g.normalized || address, source)
        } catch (e) {
          console.error('resolveByAddress failed:', e)
          const code: ErrorCode = navigator.onLine ? 'generic' : 'geocode_offline'
          set({ uiStatus: { kind: 'error', code } })
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

      adoptShared: (address, coords, chomokuId, risk) =>
        set({
          address,
          coords,
          chomokuId,
          risk,
          source: 'input',
          uiStatus: { kind: 'ready' },
          view: 'plan', // 取り込み直後は計画カードを見せる
          restoredFromStorage: false,
        }),

      backToHome: () =>
        set({
          view: 'home',
          address: null,
          coords: null,
          chomokuId: null,
          risk: null,
          source: null,
          uiStatus: { kind: 'idle' },
          restoredFromStorage: false,
        }),

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'yata-guide-last-plan',
      // localStorage（既定）。永続化するのは「前回の判定結果」に必要な最小限のみ。
      // 入力途中の値・UI状態・タブ位置は保存しない（再訪時は必ずカードから始める）。
      partialize: (s) => ({
        address: s.address,
        coords: s.coords,
        chomokuId: s.chomokuId,
        risk: s.risk,
      }),
      // 復元後の後処理：前回結果があればカード表示可能状態にし、「前回結果」ラベルを立てる。
      onRehydrateStorage: () => (state) => {
        if (state?.risk && state.coords) {
          state.uiStatus = { kind: 'ready' }
          state.view = 'card'
          state.restoredFromStorage = true
        }
      },
    },
  ),
)

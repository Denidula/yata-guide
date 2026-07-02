import { create } from 'zustand'

/**
 * ユーザーが選択した地点（住所検索または地図タップで確定）。
 * 危険度カード・避難計画の表示対象になる。
 */
export interface SelectedPoint {
  /** 検索・入力された住所文字列 */
  address: string
  /** 経度 */
  lng: number
  /** 緯度 */
  lat: number
}

export interface PlanState {
  /** 住所入力欄の現在値（未確定） */
  addressInput: string
  /** 確定済みの選択地点。未選択時は null */
  selectedPoint: SelectedPoint | null

  setAddressInput: (value: string) => void
  setSelectedPoint: (point: SelectedPoint | null) => void
  reset: () => void
}

const initialState: Pick<PlanState, 'addressInput' | 'selectedPoint'> = {
  addressInput: '',
  selectedPoint: null,
}

/**
 * 避難計画フロー全体で共有する最小限のstate雛形。
 * 住所入力 → 地点確定 → （後続フェーズで）危険度カード・避難計画へ連携する想定。
 */
export const usePlanStore = create<PlanState>((set) => ({
  ...initialState,

  setAddressInput: (value) => set({ addressInput: value }),
  setSelectedPoint: (point) => set({ selectedPoint: point }),
  reset: () => set(initialState),
}))

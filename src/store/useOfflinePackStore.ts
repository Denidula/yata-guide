import { create } from 'zustand'
import {
  isMarkerFresh,
  precacheHomeArea,
  readMarker,
} from '../lib/offlineTiles'

/**
 * useOfflinePackStore — 災害モード（自宅周辺タイルのプリキャッシュ）の進捗状態（P2-W3）。
 * 実行本体は lib/offlineTiles.ts。ここはUI表示用の状態と多重実行ガードのみ。
 * 永続化しない（完了マーカーは offlineTiles 側の localStorage が正）。
 */

export type OfflinePackStatus = 'idle' | 'running' | 'done' | 'error'

interface OfflinePackState {
  status: OfflinePackStatus
  done: number
  total: number
  /** 完了マーカーの保存時刻（ms epoch。doneのとき表示に使う） */
  savedAt: number | null
  /** 直近実行で失敗したタイル数（>0なら「一部保存できず」注記） */
  failedCount: number
  /**
   * 判定地点のプリキャッシュを必要なら開始する。
   * 済みマーカーが新鮮（同地点・14日以内）ならネットワークを使わず done にするだけ。
   * @param force true=マーカーを無視して取り直し（「保存し直す」ボタン）
   */
  ensure: (origin: { lng: number; lat: number }, force?: boolean) => void
}

export const useOfflinePackStore = create<OfflinePackState>()((set, get) => ({
  status: 'idle',
  done: 0,
  total: 0,
  savedAt: null,
  failedCount: 0,

  ensure: (origin, force = false) => {
    if (get().status === 'running') return

    const marker = readMarker()
    if (!force && isMarkerFresh(marker, origin)) {
      set({ status: 'done', savedAt: marker!.ts, failedCount: 0 })
      return
    }
    if (!navigator.onLine) {
      // オフライン中は取得できない。保存済みマーカーがあればその状態を見せる
      set(marker ? { status: 'done', savedAt: marker.ts } : { status: 'idle' })
      return
    }

    set({ status: 'running', done: 0, total: 0, failedCount: 0 })
    precacheHomeArea(origin, (done, total) => set({ done, total }))
      .then((r) => {
        const anySaved = r.gsi + r.hazard > 0
        set({
          status: anySaved ? 'done' : 'error',
          savedAt: anySaved ? Date.now() : null,
          failedCount: r.failed,
        })
      })
      .catch((e) => {
        console.error('precacheHomeArea failed:', e)
        set({ status: 'error' })
      })
  },
}))

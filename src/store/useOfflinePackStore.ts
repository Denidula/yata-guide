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

/** 実行の通し番号。タイムアウト後に遅れて完了した古い実行の結果を無視するために使う（M-11）。 */
let runSeq = 0
/** これを超えて「保存中…」のままなら失敗扱いにして再試行できるようにする（M-11）。 */
const RUN_TIMEOUT_MS = 120_000

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
      set(marker ? { status: 'done', savedAt: marker.ts, failedCount: 0 } : { status: 'idle' })
      return
    }

    const run = ++runSeq
    set({ status: 'running', done: 0, total: 0, failedCount: 0 })

    // ウォッチドッグ: fetchが応答せず「保存中…」のまま固まったら失敗にして再試行導線を出す（M-11）。
    // 遅れて完了した本体の結果は run 比較で無視される。
    const watchdog = window.setTimeout(() => {
      if (run === runSeq && get().status === 'running') {
        runSeq++ // 本体の遅延完了を無効化
        set({ status: 'error' })
      }
    }, RUN_TIMEOUT_MS)

    // 進捗は5件ごと＋完了時のみ反映（aria-live=politeの読み上げ過多を防ぐ）
    precacheHomeArea(
      origin,
      (done, total) => {
        if (run !== runSeq) return
        if (done === total || done % 5 === 0) set({ done, total })
      },
      { force },
    )
      .then((r) => {
        if (run !== runSeq) return // タイムアウト済みの古い実行
        // markerWritten=false は「保存済み」を名乗れない状態（取得/保存の失敗が多すぎる。R-1）。
        // その場合は error 表示にし、旧マーカー（過去の正常なパック）は据え置かれる。
        if (r.markerWritten) {
          set({ status: 'done', savedAt: Date.now(), failedCount: r.failed })
        } else {
          set({ status: 'error', savedAt: null, failedCount: r.failed })
        }
      })
      .catch((e) => {
        console.error('precacheHomeArea failed:', e)
        if (run === runSeq) set({ status: 'error' })
      })
      .finally(() => window.clearTimeout(watchdog))
  },
}))

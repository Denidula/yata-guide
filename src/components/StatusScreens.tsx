import { usePlanStore, type ErrorCode } from '../store/usePlanStore'
import { STRINGS } from '../lib/constants'

/**
 * 判定中のローディング表示。
 * 通信不安定でfetchが返らないケースの脱出口としてキャンセル導線を持つ（レビューM-9）。
 * キャンセルは backToHome（内部で検索世代を進める）なので、遅れて完了した
 * 判定結果が後から画面を上書きすることもない。
 */
export function LoadingScreen() {
  const backToHome = usePlanStore((s) => s.backToHome)
  return (
    <div className="loading-wrap" aria-live="polite" aria-busy="true">
      <div className="spinner" />
      <p>{STRINGS.home.loading}</p>
      <button className="btn outline loading-cancel" onClick={backToHome}>
        {STRINGS.home.loadingCancel}
      </button>
    </div>
  )
}

const ERROR_MESSAGE: Record<ErrorCode, string> = {
  geocode_failed: STRINGS.errors.geocodeFailed,
  geocode_offline: STRINGS.errors.geocodeOffline,
  out_of_area: STRINGS.errors.outOfArea,
  geo_denied: STRINGS.errors.geoDenied,
  geo_unavailable: STRINGS.errors.geoUnavailable,
  generic: STRINGS.errors.generic,
}

/** ジオコーディング失敗／判定対象外／位置情報エラーの表示。 */
export function ErrorScreen({ code }: { code: ErrorCode }) {
  const backToHome = usePlanStore((s) => s.backToHome)
  return (
    <div className="error-box" aria-live="assertive">
      <div className="note-inline error">
        <span className="i" aria-hidden="true">
          ！
        </span>
        <span>{ERROR_MESSAGE[code]}</span>
      </div>
      <button className="btn big" onClick={backToHome}>
        {STRINGS.errors.backBtn}
      </button>
    </div>
  )
}

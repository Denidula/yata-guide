import { usePlanStore, type ErrorCode } from '../store/usePlanStore'
import { STRINGS } from '../lib/constants'

/** 判定中のローディング表示。 */
export function LoadingScreen() {
  return (
    <div className="loading-wrap" aria-live="polite" aria-busy="true">
      <div className="spinner" />
      <p>{STRINGS.home.loading}</p>
    </div>
  )
}

const ERROR_MESSAGE: Record<ErrorCode, string> = {
  geocode_failed: STRINGS.errors.geocodeFailed,
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
          ⚠
        </span>
        <span>{ERROR_MESSAGE[code]}</span>
      </div>
      <button className="btn" onClick={backToHome}>
        住所入力にもどる
      </button>
    </div>
  )
}

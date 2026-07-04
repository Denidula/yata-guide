import { useEffect } from 'react'
import { usePlanStore } from '../store/usePlanStore'
import { preloadPip } from '../lib/pip'
import { loadLookup } from '../lib/risk'
import { STRINGS, DEMO_CHIPS, RANK_COLOR } from '../lib/constants'

/**
 * ホーム／住所入力画面。
 * 「住所入力→ボタン1回 / 現在地1回 / chip1回」で危険度カードへ到達する（3秒体験の核）。
 */
export function Home() {
  const addressInput = usePlanStore((s) => s.addressInput)
  const setAddressInput = usePlanStore((s) => s.setAddressInput)
  const resolveByAddress = usePlanStore((s) => s.resolveByAddress)
  const resolveByCoords = usePlanStore((s) => s.resolveByCoords)
  const setGeoError = usePlanStore((s) => s.setGeoError)

  // ホーム表示時に判定用データを先読み（体感速度向上）
  useEffect(() => {
    void preloadPip()
    void loadLookup()
  }, [])

  const submitAddress = () => {
    const v = addressInput.trim()
    if (!v) return
    void resolveByAddress(v, 'input')
  }

  const useCurrentLocation = () => {
    if (!('geolocation' in navigator)) {
      setGeoError('geo_unavailable')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void resolveByCoords(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        setGeoError('geo_denied')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  return (
    <section aria-label="ホーム・住所入力">
      <div className="hero">
        <p className="catch">
          {STRINGS.home.catchLine1}
          <br />
          <em>{STRINGS.home.catchEmphasis}</em>
          {STRINGS.home.catchLine2}
        </p>
        <p className="sub">{STRINGS.home.sub}</p>

        <div className="searchcard">
          <label htmlFor="addr">{STRINGS.home.addrLabel}</label>
          <input
            className="addr-input"
            id="addr"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder={STRINGS.home.addrPlaceholder}
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAddress()
            }}
          />
          <button className="btn big" style={{ marginTop: 10 }} onClick={submitAddress}>
            <span aria-hidden="true">🔍</span> {STRINGS.home.searchBtn}
          </button>

          <div className="or-row">{STRINGS.home.or}</div>

          <button className="btn big locbtn" onClick={useCurrentLocation}>
            <span aria-hidden="true">📍</span> {STRINGS.home.locBtn}
          </button>
          {/* 位置情報の常設注記（拒否検知後ではなく最初から表示） */}
          <div className="note-inline gray geo-hint">
            <span className="i" aria-hidden="true">
              ⓘ
            </span>
            <span>{STRINGS.home.geoHint}</span>
          </div>
        </div>

        {/* デモ地点chip（実データをジオコーディング→PIP→判定して遷移） */}
        <div className="samples">
          <div className="h-sec">{STRINGS.home.samplesLabel}</div>
          <div className="chip-row">
            {DEMO_CHIPS.map((chip) => (
              <button
                key={chip.key}
                className="chip"
                onClick={() => void resolveByAddress(chip.address, 'demo')}
              >
                <span className="rk" style={{ background: RANK_COLOR[chip.rank] }}>
                  総合{chip.rank}
                </span>{' '}
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="feat3">
          <div className="f">
            <div className="ic" aria-hidden="true">
              🏚️
            </div>
            <div className="t">{STRINGS.home.feat1}</div>
          </div>
          <div className="f">
            <div className="ic" aria-hidden="true">
              🗺️
            </div>
            <div className="t">{STRINGS.home.feat2}</div>
          </div>
          <div className="f">
            <div className="ic" aria-hidden="true">
              ✈️
            </div>
            <div className="t">{STRINGS.home.feat3}</div>
          </div>
        </div>
      </div>

      <div className="disclaimer">
        <p className="src">
          <b>出典：</b>
          {STRINGS.disclaimer.home.src.replace('出典：', '')}
        </p>
        <p>{STRINGS.disclaimer.home.body}</p>
      </div>
    </section>
  )
}

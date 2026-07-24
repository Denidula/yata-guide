import { useEffect } from 'react'
import { usePlanStore } from '../store/usePlanStore'
import { preloadPip } from '../lib/pip'
import { loadLookup } from '../lib/risk'
import { preloadFacilities } from '../lib/shelters'
import {
  STRINGS,
  DEMO_CHIPS,
  RANK_COLOR,
  RANK_TEXT,
  RANK_BORDER,
  RANK_WORD,
} from '../lib/constants'
import { Icon } from './Icon'

/**
 * ホーム／住所入力画面（R1）。
 * 白地・左寄せリード＋入力フォーム＋デモ地点の縦積みリスト型chip。
 * 「住所入力→ボタン1回 / 現在地1回 / chip1回」で危険度カードへ到達する（2秒体験の核）。
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
    void preloadFacilities()
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
      (err) => {
        // 1=PERMISSION_DENIED（設定案内を出す）／2=POSITION_UNAVAILABLE・3=TIMEOUT（再試行案内）
        setGeoError(err.code === err.PERMISSION_DENIED ? 'geo_denied' : 'geo_failed')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  return (
    <section className="home" aria-label="ホーム・住所入力">
      {/* リード */}
      <div className="lead">
        <h1>
          住所を入れるだけ
          <br />
          <em>いざという時</em>の道がわかる
        </h1>
        <p className="sub">{STRINGS.home.sub}</p>
      </div>

      {/* 入力フォーム */}
      <div className="searchform">
        <label htmlFor="addr">
          住所<span className="hint">丁目まで入力</span>
        </label>
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
        <button className="btn big" onClick={submitAddress}>
          <Icon name="search" size={18} /> {STRINGS.home.searchBtn}
        </button>

        <div className="or-row" aria-hidden="true">
          {STRINGS.home.or}
        </div>

        <button className="btn big outline" onClick={useCurrentLocation}>
          <Icon name="location-current" size={18} /> {STRINGS.home.locBtn}
        </button>

        {/* 位置情報の常設注記（拒否検知後ではなく最初から表示） */}
        <div className="note-inline gray geo-hint">
          <Icon name="info" size={15} />
          <span>{STRINGS.home.geoHint}</span>
        </div>
      </div>

      {/* デモ地点chip（実データをジオコーディング→PIP→判定して遷移） */}
      <div className="samples">
        <h2 className="h-sec">
          デモ地点で試す<span className="sub">実データで判定</span>
        </h2>
        <div className="chip-list">
          {DEMO_CHIPS.map((chip) => (
            <button
              key={chip.key}
              className="chip"
              onClick={() => void resolveByAddress(chip.address, 'demo')}
            >
              <span
                className="rk"
                style={{
                  background: RANK_COLOR[chip.rank],
                  color: RANK_TEXT[chip.rank],
                  borderColor: RANK_BORDER[chip.rank],
                }}
              >
                {chip.rank}
              </span>
              <span className="chip-body">
                <span className="chip-label">{chip.label}</span>
                <span className="chip-word">総合危険度 {RANK_WORD[chip.rank]}</span>
              </span>
              <Icon name="chevron-right" size={16} className="chevron" />
            </button>
          ))}
        </div>
      </div>

      {/* 出典・免責 */}
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

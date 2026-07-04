import { usePlanStore } from '../store/usePlanStore'
import { RankGauge } from './RankGauge'
import {
  STRINGS,
  RANK_COLOR,
  RANK_WORD,
  RANK_NOTE,
  LIQ_WORD,
} from '../lib/constants'
import type { RiskInfo } from '../lib/risk'

/** 液状化スケールの塗り色（3以上は橙で警告寄せ、ワイヤーフレーム準拠）。 */
function liqColor(level: number): string {
  if (level >= 3) return RANK_COLOR[4]
  return RANK_COLOR[level] ?? RANK_COLOR[2]
}

/**
 * 危険度カード（アプリの主役）。
 * 総合ランク大バッジ／建物・火災の5セグメントゲージ（色覚4重符号化）／
 * 都内順位／地盤分類＋液状化参考／出典・免責フッター。
 * ※木密バッジはデータ未整備のため非表示（下記TODO）。
 */
export function RiskCard({ risk }: { risk: RiskInfo }) {
  const address = usePlanStore((s) => s.address)
  const coords = usePlanStore((s) => s.coords)
  const backToHome = usePlanStore((s) => s.backToHome)
  const setView = usePlanStore((s) => s.setView)

  const overall = risk.total.rank
  const showCoarseNote = coords != null && !coords.precise

  return (
    <section aria-label="危険度カード">
      {/* 住所ヘッダー */}
      <div className="addr-head">
        <span className="pin" aria-hidden="true">
          📍
        </span>
        <div>
          <div className="a1">
            {risk.ward} {risk.town}
          </div>
          <div className="a2">
            {address && address !== '現在地' ? `${address} ` : `東京都${risk.ward} `}
            {STRINGS.card.addrSubSuffix}
          </div>
        </div>
        <button className="change" onClick={backToHome}>
          {STRINGS.card.changeBtn}
        </button>
      </div>

      {/* 代表点精度の注記（point.level<8 のとき） */}
      {showCoarseNote && (
        <div className="note-inline gray" style={{ margin: '12px 16px 0' }}>
          <span className="i" aria-hidden="true">
            ⓘ
          </span>
          <span>{STRINGS.card.coarsePrecisionNote}</span>
        </div>
      )}

      {/* 総合危険度 */}
      <div className="overall">
        <div className="top" style={{ background: RANK_COLOR[overall] }}>
          <div className="rank-badge">
            <span className="num">{overall}</span>
            <span className="of">{STRINGS.card.rankOfSuffix}</span>
          </div>
          <div className="lab">
            <div className="k">{STRINGS.card.overallLabel}</div>
            <div className="v">{RANK_WORD[overall]}</div>
            <span className="rankword">{STRINGS.card.orderTemplate(risk.total.order)}</span>
          </div>
        </div>
        <div className="meta">
          <span>{STRINGS.card.overallScale}</span>
          <b>{RANK_NOTE[overall]}</b>
        </div>
      </div>

      {/* 建物倒壊・火災の個別ゲージ */}
      <div className="gauges">
        <div className="gauge">
          <div className="g-top">
            <span className="ic" aria-hidden="true">
              🏚️
            </span>
            <span className="name">{STRINGS.card.bldName}</span>
            <span className="rankn" style={{ background: RANK_COLOR[risk.building.rank] }}>
              {STRINGS.card.rankPrefix}
              {risk.building.rank}
            </span>
          </div>
          <RankGauge
            rank={risk.building.rank}
            label={`${STRINGS.card.bldName} ランク${risk.building.rank}`}
          />
          <div className="g-cap">
            {STRINGS.card.orderTemplate(risk.building.order)}。{STRINGS.card.bldCapSuffix}
          </div>
        </div>

        <div className="gauge">
          <div className="g-top">
            <span className="ic" aria-hidden="true">
              🔥
            </span>
            <span className="name">{STRINGS.card.fireName}</span>
            <span className="rankn" style={{ background: RANK_COLOR[risk.fire.rank] }}>
              {STRINGS.card.rankPrefix}
              {risk.fire.rank}
            </span>
          </div>
          <RankGauge
            rank={risk.fire.rank}
            label={`${STRINGS.card.fireName} ランク${risk.fire.rank}`}
          />
          <div className="g-cap">
            {STRINGS.card.orderTemplate(risk.fire.order)}。{STRINGS.card.fireCapSuffix}
          </div>
        </div>
      </div>

      {/* 地盤・液状化（参考） */}
      <div className="info-rows">
        <div className="irow">
          <div className="r-top">
            <span className="ic" aria-hidden="true">
              🪨
            </span>
            <span className="name">{STRINGS.card.groundName}</span>
            <span className="val">{risk.ground}</span>
          </div>
          <div className="r-cap">{STRINGS.card.groundCap}</div>

          <div
            style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-sub)' }}
          >
            {STRINGS.card.liqTitle}
          </div>
          <div className="liq-scale" aria-label={`${STRINGS.card.liqTitle} ${LIQ_WORD[risk.liquefaction]}`}>
            {[1, 2, 3, 4].map((lv) => {
              const on = lv === risk.liquefaction
              return (
                <span
                  key={lv}
                  className={on ? 'l on' : 'l'}
                  style={on ? { background: liqColor(lv), color: '#fff' } : undefined}
                >
                  {LIQ_WORD[lv]}
                </span>
              )
            })}
          </div>
          <div className="note-inline" style={{ marginTop: 8 }}>
            <span className="i" aria-hidden="true">
              ※
            </span>
            <span>{STRINGS.card.liqNote}</span>
          </div>
        </div>

        {/*
          TODO(W2以降): 木密（整備地域）バッジ。
          整備地域ポリゴンが未整備（point-in-polygon 判定用データが無い）ため今回は非表示。
          データ整備後、現在地が「整備地域」内かをPIP判定し、該当時のみバッジ＋
          「町丁目単位ではなく整備地域単位」の注記（§7-B）を表示する。
        */}
      </div>

      {/* 次アクション：地図はW2で実装済み。計画は準備中。 */}
      <div className="next-cta">
        <button className="btn big" onClick={() => setView('map')}>
          <span aria-hidden="true">🗺️</span> {STRINGS.card.ctaMap}
        </button>
        <button className="btn secondary" disabled title={STRINGS.card.ctaComingSoon}>
          <span aria-hidden="true">📝</span> {STRINGS.card.ctaPlan}
        </button>
      </div>

      {/* 出典・免責フッター（常設） */}
      <div className="disclaimer">
        <p>{STRINGS.disclaimer.card}</p>
      </div>
    </section>
  )
}

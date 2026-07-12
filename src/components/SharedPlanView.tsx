import { useState } from 'react'
import { Icon } from './Icon'
import { PlanCard } from './PlanCard'
import { STRINGS } from '../lib/constants'
import { adoptSharedPlan, type SharedPlanPayload } from '../lib/share'

/**
 * 共有URL（#p=...）の受信側・閲覧モード（P2-W2）。
 * 受け取った計画カードを閲覧専用で表示し、本人が確認してから端末に保存する
 * （保存＝プロフィールをIndexedDBへ、地点をPIP→リスク再解決して判定結果へ取り込み）。
 * 壊れたリンクは invalid として案内を出す。
 */
export function SharedPlanView({
  payload,
  onClose,
}: {
  payload: SharedPlanPayload | 'invalid'
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  if (payload === 'invalid') {
    return (
      <div className="error-box" aria-live="assertive">
        <div className="note-inline error">
          <span className="i" aria-hidden="true">
            ！
          </span>
          <span>{STRINGS.share.invalidNote}</span>
        </div>
        <button className="btn big" onClick={onClose}>
          {STRINGS.share.backBtn}
        </button>
      </div>
    )
  }

  const adopt = async () => {
    // 保存確認（spec: 受信データは保存確認してから保存）
    if (!window.confirm(STRINGS.share.adoptConfirm)) return
    setSaving(true)
    setFailed(false)
    try {
      const ok = await adoptSharedPlan(payload)
      if (!ok) {
        setFailed(true)
        setSaving(false)
        return
      }
      // store側で view:'plan' になっているので、ハッシュを消して通常画面へ
      onClose()
    } catch (e) {
      console.error('adoptSharedPlan failed:', e)
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <>
      {/* 閲覧モードの明示バナー */}
      <div className="shared-banner" role="status">
        <span className="sb-tag">
          <Icon name="info" size={14} />
          {STRINGS.share.receivedLabel}
        </span>
        <span className="sb-note">{STRINGS.share.receivedNote}</span>
      </div>

      <PlanCard
        ward={payload.ward}
        town={payload.town}
        address={payload.address}
        origin={{ lat: payload.lat, lng: payload.lng }}
        profile={payload.profile}
        shared
      />

      {failed && (
        <div className="note-inline error" style={{ margin: '12px 20px 0' }}>
          <span className="i" aria-hidden="true">
            ！
          </span>
          <span>{STRINGS.share.adoptFailed}</span>
        </div>
      )}

      <div className="next-cta" style={{ marginBottom: 20 }}>
        <button className="btn big" onClick={adopt} disabled={saving}>
          {STRINGS.share.adoptBtn}
        </button>
        <button className="btn big outline" onClick={onClose} disabled={saving}>
          {STRINGS.share.discardBtn}
        </button>
      </div>
    </>
  )
}

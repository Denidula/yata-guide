import { useState } from 'react'
import { usePlanStore } from '../store/usePlanStore'
import { useProfileStore } from '../store/useProfileStore'
import { ProfileForm } from './ProfileForm'
import { PlanCard } from './PlanCard'
import { STRINGS } from '../lib/constants'

/**
 * 計画タブのルート（P2-W1）。
 * - プロフィール未作成 → 入力フォーム（保存で計画カードへ）
 * - 作成済み → 計画カード（「家族情報を変える」でフォームに戻れる）
 * - IndexedDBからの復元中はフォームを空で初期化しないよう読み込み表示を挟む
 * risk / coords は App.tsx とタブの disabled ガードにより確定済みで渡ってくる前提。
 */
export function PlanScreen() {
  const risk = usePlanStore((s) => s.risk)
  const coords = usePlanStore((s) => s.coords)
  const address = usePlanStore((s) => s.address)
  const profile = useProfileStore((s) => s.profile)
  const hydrated = useProfileStore((s) => s.hydrated)
  const [editing, setEditing] = useState(false)

  // App.tsx側で view==='plan' は risk確定時のみレンダリングされるが、型と実行時の両方で防御。
  if (!risk || !coords) return null

  if (!hydrated) {
    return (
      <div className="loading-wrap" aria-live="polite" aria-busy="true">
        <div className="spinner" />
        <p>{STRINGS.profile.loading}</p>
      </div>
    )
  }

  if (!profile || editing) {
    return <ProfileForm onSaved={() => setEditing(false)} />
  }

  return (
    <PlanCard
      ward={risk.ward}
      town={risk.town}
      address={address ?? `東京都${risk.ward}`}
      origin={{ lat: coords.lat, lng: coords.lng }}
      profile={profile}
      onEdit={() => setEditing(true)}
    />
  )
}

import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { SharePanel } from './SharePanel'
import { STRINGS } from '../lib/constants'
import { buildPlan, type EvacuationPlan } from '../lib/plan'
import { activeBarrierFree, type FukushiWithDistance } from '../lib/shelters'
import { KIT_SOURCE, type KitItem } from '../data/emergency_kit'
import { useOfflinePackStore } from '../store/useOfflinePackStore'
import type { FamilyProfile } from '../store/useProfileStore'

/** 保存時刻の短い表示（例: 7/12 13:05）。 */
function fmtWhen(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

/** 災害モード（オフライン保存）ステータスブロック。通常モードの計画カードにのみ出す。 */
function OfflinePackBlock({ origin }: { origin: { lat: number; lng: number } }) {
  const { status, done, total, savedAt, failedCount, ensure } = useOfflinePackStore()

  // 計画カード表示（＝計画の保存/復元）を起点にプリキャッシュ。済みならマーカー確認のみ。
  useEffect(() => {
    ensure({ lng: origin.lng, lat: origin.lat })
  }, [ensure, origin.lat, origin.lng])

  return (
    <div className="offline-pack">
      <div className="es-title">
        <Icon name="airplane-mode" size={18} /> {STRINGS.offlinePack.title}
      </div>
      <div className="op-status" role="status" aria-live="polite">
        {status === 'running' && (
          <span className="op-running">{STRINGS.offlinePack.running(done, total)}</span>
        )}
        {status === 'done' && savedAt != null && (
          <span>{STRINGS.offlinePack.doneNote(fmtWhen(savedAt))}</span>
        )}
        {status === 'done' && failedCount > 0 && (
          <span className="op-warn">{STRINGS.offlinePack.partialNote}</span>
        )}
        {status === 'error' && <span className="op-warn">{STRINGS.offlinePack.errorNote}</span>}
        {status === 'idle' && <span>{STRINGS.offlinePack.idleNote}</span>}
      </div>
      {(status === 'done' || status === 'error') && (
        <button
          className="op-redo"
          onClick={() => ensure({ lng: origin.lng, lat: origin.lat }, true)}
        >
          {STRINGS.offlinePack.redoBtn}
        </button>
      )}
    </div>
  )
}

/** プロフィール要約タグ（カード上部。何に基づく計画かを見える化）。 */
function profileTags(profile: FamilyProfile): string[] {
  const tags: string[] = [`${profile.size}${STRINGS.profile.sizeUnit}`]
  if (profile.ages.infant) tags.push(STRINGS.profile.ageInfant)
  if (profile.ages.child) tags.push(STRINGS.profile.ageChild)
  if (profile.ages.senior) tags.push(STRINGS.profile.ageSenior)
  if (profile.attrs.wheelchair) tags.push(STRINGS.profile.attrWheelchair)
  if (profile.attrs.visual) tags.push(STRINGS.profile.attrVisual)
  if (profile.attrs.hearing) tags.push(STRINGS.profile.attrHearing)
  if (profile.attrs.dementia) tags.push(STRINGS.profile.attrDementia)
  if (profile.attrs.medical) tags.push(STRINGS.profile.attrMedical)
  if (profile.attrs.pregnant) tags.push(STRINGS.profile.attrPregnant)
  if (profile.pet === 'dog_cat') tags.push(`ペット（${STRINGS.profile.petDogCat}）`)
  if (profile.pet === 'other') tags.push(`ペット（${STRINGS.profile.petOther}）`)
  return tags
}

/** 持ち出し品1件（チェックは表示中のみのメモ。保存はしない）。 */
function KitRow({
  item,
  checked,
  onToggle,
}: {
  item: KitItem
  checked: boolean
  onToggle: () => void
}) {
  return (
    <li className="kit-item">
      <label>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="kit-text">
          {item.label}
          {item.note && <span className="kit-note">{item.note}</span>}
        </span>
      </label>
    </li>
  )
}

/** 福祉避難所の1行。 */
function FukushiRow({ f }: { f: FukushiWithDistance }) {
  return (
    <div className="fk-item">
      <div className="fk-name">{f.name}</div>
      <div className="fk-meta">
        <span className="fk-cat">{f.category}</span>
        <span className="es-dist fukushi">{STRINGS.map.distFmt(f.distanceM, f.walkMin)}</span>
      </div>
    </div>
  )
}

/**
 * マイ避難計画カード（P2-W1の本体）。
 * プロフィール＋判定済み地点から plan.ts のルールエンジンで生成した内容を
 * 危険度カードと同じデザイン言語（.card / .es-* / .note-inline）で1枚に集約する。
 * 印刷（Phase3のPDF化）を意識して縦積み・セクション明確の構成にしている。
 * shared=true は共有URLの受信閲覧モード（W2）: 編集・共有ボタンを出さない。
 */
export function PlanCard({
  ward,
  town,
  address,
  origin,
  profile,
  onEdit,
  shared = false,
}: {
  ward: string
  town: string
  /** 表示住所（共有URLに含める。sharedでは受信ペイロードの値） */
  address: string
  origin: { lat: number; lng: number }
  profile: FamilyProfile
  /** 通常モードの編集導線（sharedでは不要） */
  onEdit?: () => void
  /** true=受信閲覧モード */
  shared?: boolean
}) {
  const [plan, setPlan] = useState<EvacuationPlan | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setPlan(null)
    setFailed(false)
    buildPlan(profile, { lng: origin.lng, lat: origin.lat }, ward)
      .then((p) => {
        if (alive) setPlan(p)
      })
      .catch((e) => {
        console.error('buildPlan failed:', e)
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [profile, origin.lat, origin.lng, ward])

  // 持ち出し品のチェック状態（表示中のみ。端末保存はしない＝毎回まっさらな確認リスト）
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  if (failed) {
    return (
      <div className="error-box" aria-live="assertive">
        <div className="note-inline error">
          <span className="i" aria-hidden="true">
            ！
          </span>
          <span>{STRINGS.errors.generic}</span>
        </div>
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="loading-wrap" aria-live="polite" aria-busy="true">
        <div className="spinner" />
        <p>{STRINGS.profile.loading}</p>
      </div>
    )
  }

  const hasBfRequirement = plan.requiredBf.length > 0
  const anyPrioritized = plan.centers.some((c) => c.prioritized)
  const meetingSet = profile.meetingText.trim() !== '' || profile.meetingAreaName != null

  return (
    <section className="card plan-card" aria-label="マイ避難計画カード">
      {/* 見出し（タイトル＋対象地点＋家族情報の編集導線） */}
      <div className="addr-head">
        <Icon name="clipboard-plan" size={20} className="pin" />
        <div className="addr-body">
          <div className="a1">{STRINGS.plan.title}</div>
          <div className="a2">
            {ward} {town} {STRINGS.plan.forAddressSuffix}
          </div>
        </div>
        {!shared && onEdit && (
          <button className="change" onClick={onEdit}>
            {STRINGS.plan.editProfileBtn}
          </button>
        )}
      </div>

      {/* この計画の前提（プロフィール要約タグ） */}
      <div className="plan-tags" aria-label="この計画の前提">
        {profileTags(profile).map((t) => (
          <span key={t} className="ptag">
            {t}
          </span>
        ))}
      </div>

      {/* 避難先（優先順） */}
      <div className="evac-summary">
        <div className="es-title">
          <Icon name="pin-map" size={18} /> {STRINGS.plan.evacTitle}
        </div>

        {/* ① まず逃げる（避難場所） */}
        <div className="es-row area">
          <div className="es-head">
            <span className="es-dot area" aria-hidden="true" />
            <span className="es-label">
              ① {STRINGS.plan.stepArea}
              <span className="es-sublabel">{STRINGS.plan.stepAreaSub}</span>
            </span>
          </div>
          {plan.area ? (
            <>
              <div className="es-name">{plan.area.name}</div>
              <div className="es-dist area">
                {STRINGS.map.distFmt(plan.area.distanceM, plan.area.walkMin)}
              </div>
            </>
          ) : (
            <div className="es-none">{STRINGS.plan.evacNone}</div>
          )}
        </div>

        {/* ② 生活避難する（避難所。BF要件があれば適合を優先） */}
        <div className="es-row center">
          <div className="es-head">
            <span className="es-dot center" aria-hidden="true" />
            <span className="es-label">
              ② {STRINGS.plan.stepCenter}
              <span className="es-sublabel">{STRINGS.plan.stepCenterSub}</span>
            </span>
          </div>
          {plan.centers.length === 0 && <div className="es-none">{STRINGS.plan.evacNone}</div>}
          {plan.centers.map((c) => (
            <div key={`${c.name}-${c.address}`} className="plan-center">
              <div className="es-name">
                {c.name}
                {c.prioritized && <span className="bf-badge">{STRINGS.plan.bfBadge}</span>}
                {!c.prioritized && hasBfRequirement && (
                  <span className="plain-badge">{STRINGS.plan.bfPlainLabel}</span>
                )}
              </div>
              <div className="es-dist center">{STRINGS.map.distFmt(c.distanceM, c.walkMin)}</div>
              {c.prioritized && (
                <div className="es-bf">
                  設備：{activeBarrierFree(c.bf).map((d) => d.label).join('・') || '公表情報あり'}
                </div>
              )}
            </div>
          ))}
          {hasBfRequirement && anyPrioritized && (
            <div className="note-inline blue" style={{ marginTop: 10 }}>
              <Icon name="info" size={15} />
              <span>{STRINGS.plan.bfPriorityNote}</span>
            </div>
          )}
          {hasBfRequirement && !anyPrioritized && (
            <div className="note-inline gray" style={{ marginTop: 10 }}>
              <Icon name="info" size={15} />
              <span>{STRINGS.plan.bfNoMatch}</span>
            </div>
          )}
        </div>

        {/* ③ 福祉避難所（要配慮メンバーがいる世帯のみ） */}
        {plan.fukushi && (
          <div className="es-row fukushi">
            <div className="es-head">
              <span className="es-dot fukushi" aria-hidden="true" />
              <span className="es-label">
                ③ {STRINGS.plan.stepFukushi}
                <span className="es-sublabel">{STRINGS.plan.stepFukushiSub}</span>
              </span>
            </div>
            {plan.fukushi.status === 'covered' ? (
              <>
                {plan.fukushi.nearest.map((f) => (
                  <FukushiRow key={`${f.name}-${f.address}`} f={f} />
                ))}
                <div className="note-inline blue" style={{ marginTop: 10 }}>
                  <Icon name="info" size={15} />
                  <span>{STRINGS.fukushi.roleNote}</span>
                </div>
              </>
            ) : (
              <div className="note-inline gray" style={{ marginTop: 8 }}>
                <Icon name="info" size={15} />
                <span>{STRINGS.fukushi.notCovered(plan.fukushi.muni)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 非常用持ち出し品（基本＋属性別） */}
      <div className="kit">
        <div className="es-title">
          <Icon name="clipboard-plan" size={18} /> {STRINGS.plan.kitTitle}
        </div>

        <div className="kit-sec">
          <div className="kit-sec-title">
            {STRINGS.plan.kitBasicTitle}
            <span className="kit-count">{STRINGS.plan.kitCount(plan.kit.basic.length)}</span>
          </div>
          <ul className="kit-list">
            {plan.kit.basic.map((item) => (
              <KitRow
                key={item.key}
                item={item}
                checked={checked.has(item.key)}
                onToggle={() => toggle(item.key)}
              />
            ))}
          </ul>
        </div>

        {plan.kit.sections.map((sec) => (
          <div className="kit-sec" key={sec.attribute}>
            <div className="kit-sec-title attr">
              ＋{sec.title}
              <span className="kit-count">{STRINGS.plan.kitCount(sec.items.length)}</span>
            </div>
            <ul className="kit-list">
              {sec.items.map((item) => (
                <KitRow
                  key={item.key}
                  item={item}
                  checked={checked.has(`${sec.attribute}:${item.key}`)}
                  onToggle={() => toggle(`${sec.attribute}:${item.key}`)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* 家族の集合場所 */}
      <div className="meeting">
        <div className="es-title">
          <Icon name="pin-address" size={18} /> {STRINGS.plan.meetingTitle}
        </div>
        {meetingSet ? (
          <div className="meeting-body">
            {profile.meetingAreaName && (
              <div className="meeting-area">
                <span className="es-dot area" aria-hidden="true" />
                {profile.meetingAreaName}
              </div>
            )}
            {profile.meetingText.trim() !== '' && (
              <div className="meeting-text">{profile.meetingText}</div>
            )}
          </div>
        ) : (
          <div className="es-none">{STRINGS.plan.meetingEmpty}</div>
        )}
      </div>

      {/* 災害モード＝自宅周辺タイルのオフライン保存（受信閲覧モードでは出さない） */}
      {!shared && <OfflinePackBlock origin={origin} />}

      {/* 共有（QR/リンク。受信閲覧モードでは出さない） */}
      {!shared && (
        <SharePanel
          payload={{ ward, town, address, lat: origin.lat, lng: origin.lng, profile }}
        />
      )}

      {/* 出典・免責フッター（持ち出し品＋福祉避難所＋既存カード免責） */}
      <div className="disclaimer">
        <p>{KIT_SOURCE.attribution}</p>
        <p>{KIT_SOURCE.disclaimer}</p>
        {plan.fukushi && <p>{STRINGS.fukushi.attribution}</p>}
        <p>{STRINGS.disclaimer.card}</p>
      </div>
    </section>
  )
}

import { useEffect, useState } from 'react'
import { usePlanStore } from '../store/usePlanStore'
import {
  emptyProfile,
  useProfileStore,
  type AgeBands,
  type CareAttrs,
  type FamilyProfile,
  type PetType,
} from '../store/useProfileStore'
import { Icon } from './Icon'
import { STRINGS } from '../lib/constants'
import {
  filterAreasByHazard,
  loadAreas,
  nearest,
  type FacilityWithDistance,
} from '../lib/shelters'

/** 年齢層チェックの定義（表示順）。 */
const AGE_DEFS: Array<{ key: keyof AgeBands; label: string }> = [
  { key: 'infant', label: STRINGS.profile.ageInfant },
  { key: 'child', label: STRINGS.profile.ageChild },
  { key: 'adult', label: STRINGS.profile.ageAdult },
  { key: 'senior', label: STRINGS.profile.ageSenior },
]

/** 要配慮属性チェックの定義（表示順）。 */
const ATTR_DEFS: Array<{ key: keyof CareAttrs; label: string }> = [
  { key: 'wheelchair', label: STRINGS.profile.attrWheelchair },
  { key: 'visual', label: STRINGS.profile.attrVisual },
  { key: 'hearing', label: STRINGS.profile.attrHearing },
  { key: 'dementia', label: STRINGS.profile.attrDementia },
  { key: 'medical', label: STRINGS.profile.attrMedical },
  { key: 'pregnant', label: STRINGS.profile.attrPregnant },
]

/** ペット選択肢（ラジオ）。 */
const PET_DEFS: Array<{ value: PetType; label: string }> = [
  { value: 'none', label: STRINGS.profile.petNone },
  { value: 'dog_cat', label: STRINGS.profile.petDogCat },
  { value: 'other', label: STRINGS.profile.petOther },
]

/** 世帯人数の範囲。 */
const SIZE_MIN = 1
const SIZE_MAX = 12

/** 集合場所候補として出す近隣避難場所の件数。 */
const MEETING_CANDIDATES = 3

/**
 * 家族プロフィール入力フォーム（P2-W1）。
 * 入力値は IndexedDB（useProfileStore）にのみ保存され、送信されない。
 * 保存済みプロフィールがあればそれを初期値に編集モードとして動く。
 */
export function ProfileForm({ onSaved }: { onSaved: () => void }) {
  const coords = usePlanStore((s) => s.coords)
  const saved = useProfileStore((s) => s.profile)
  const saveProfile = useProfileStore((s) => s.saveProfile)

  const [draft, setDraft] = useState<FamilyProfile>(() => saved ?? emptyProfile())

  // 集合場所の候補: 判定地点から近い地震対応の避難場所（地図と同じデータ）
  const [meetingAreas, setMeetingAreas] = useState<FacilityWithDistance[]>([])
  useEffect(() => {
    if (!coords) return
    let alive = true
    void loadAreas()
      .then((areas) => {
        if (!alive) return
        const origin = { lng: coords.lng, lat: coords.lat }
        setMeetingAreas(nearest(origin, filterAreasByHazard(areas, 'quake'), MEETING_CANDIDATES))
      })
      .catch(() => {
        // 候補チップが出ないだけ（自由記述は使える）
      })
    return () => {
      alive = false
    }
  }, [coords])

  const toggleAge = (key: keyof AgeBands) =>
    setDraft((d) => ({ ...d, ages: { ...d.ages, [key]: !d.ages[key] } }))
  const toggleAttr = (key: keyof CareAttrs) =>
    setDraft((d) => ({ ...d, attrs: { ...d.attrs, [key]: !d.attrs[key] } }))
  const setPet = (pet: PetType) => setDraft((d) => ({ ...d, pet }))
  const setSize = (delta: number) =>
    setDraft((d) => ({ ...d, size: Math.min(SIZE_MAX, Math.max(SIZE_MIN, d.size + delta)) }))
  const pickMeetingArea = (name: string) =>
    setDraft((d) => ({ ...d, meetingAreaName: d.meetingAreaName === name ? null : name }))

  const submit = () => {
    saveProfile(draft)
    onSaved()
  }

  return (
    <section className="profile" aria-label="わが家の情報入力">
      <div className="p-head">
        <h2 className="h-sec">
          {STRINGS.profile.title}
          <span className="sub">{STRINGS.profile.lead}</span>
        </h2>
      </div>

      {/* 端末内保存の明示（プライバシー原則） */}
      <div className="note-inline blue" style={{ margin: '12px 20px 0' }}>
        <Icon name="info" size={15} />
        <span>{STRINGS.profile.privacyNote}</span>
      </div>

      {/* 世帯人数 */}
      <div className="p-block">
        <div className="p-label" id="profile-size-label">
          {STRINGS.profile.sizeLabel}
        </div>
        <div className="stepper" role="group" aria-labelledby="profile-size-label">
          <button
            type="button"
            className="step-btn"
            aria-label={`${STRINGS.profile.sizeLabel}を減らす`}
            disabled={draft.size <= SIZE_MIN}
            onClick={() => setSize(-1)}
          >
            −
          </button>
          <span className="step-val" aria-live="polite">
            {draft.size}
            <span className="unit">{STRINGS.profile.sizeUnit}</span>
          </span>
          <button
            type="button"
            className="step-btn"
            aria-label={`${STRINGS.profile.sizeLabel}を増やす`}
            disabled={draft.size >= SIZE_MAX}
            onClick={() => setSize(1)}
          >
            ＋
          </button>
        </div>
      </div>

      {/* 年齢層 */}
      <fieldset className="p-block">
        <legend className="p-label">
          {STRINGS.profile.agesLabel}
          <span className="hint">{STRINGS.profile.agesHint}</span>
        </legend>
        <div className="check-grid">
          {AGE_DEFS.map((d) => (
            <label key={d.key} className={`check-item${draft.ages[d.key] ? ' on' : ''}`}>
              <input type="checkbox" checked={draft.ages[d.key]} onChange={() => toggleAge(d.key)} />
              <span>{d.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* 要配慮属性 */}
      <fieldset className="p-block">
        <legend className="p-label">
          {STRINGS.profile.attrsLabel}
          <span className="hint">{STRINGS.profile.attrsHint}</span>
        </legend>
        <div className="check-grid">
          {ATTR_DEFS.map((d) => (
            <label key={d.key} className={`check-item${draft.attrs[d.key] ? ' on' : ''}`}>
              <input type="checkbox" checked={draft.attrs[d.key]} onChange={() => toggleAttr(d.key)} />
              <span>{d.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* ペット */}
      <fieldset className="p-block">
        <legend className="p-label">{STRINGS.profile.petLabel}</legend>
        <div className="check-grid pet">
          {PET_DEFS.map((d) => (
            <label key={d.value} className={`check-item${draft.pet === d.value ? ' on' : ''}`}>
              <input
                type="radio"
                name="profile-pet"
                checked={draft.pet === d.value}
                onChange={() => setPet(d.value)}
              />
              <span>{d.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* 家族の集合場所（自由記述＋近隣避難場所からの選択） */}
      <div className="p-block">
        <label className="p-label" htmlFor="profile-meeting">
          {STRINGS.profile.meetingLabel}
          <span className="hint">{STRINGS.profile.meetingHint}</span>
        </label>
        <input
          className="addr-input"
          id="profile-meeting"
          type="text"
          autoComplete="off"
          placeholder={STRINGS.profile.meetingPlaceholder}
          value={draft.meetingText}
          onChange={(e) => setDraft((d) => ({ ...d, meetingText: e.target.value }))}
        />
        {meetingAreas.length > 0 && (
          <>
            <div className="p-sublabel">{STRINGS.profile.meetingPickLabel}</div>
            <div className="pick-chips">
              {meetingAreas.map((a) => (
                <button
                  key={`${a.name}-${a.address}`}
                  type="button"
                  className="pick-chip"
                  aria-pressed={draft.meetingAreaName === a.name}
                  onClick={() => pickMeetingArea(a.name)}
                >
                  <span className="pc-name">{a.name}</span>
                  <span className="pc-dist">{STRINGS.map.distFmt(a.distanceM, a.walkMin)}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 保存（→計画カード生成へ） */}
      <div className="next-cta">
        <button className="btn big" onClick={submit}>
          <Icon name="clipboard-plan" size={18} />
          {saved ? STRINGS.profile.updateBtn : STRINGS.profile.submitBtn}
        </button>
        {saved && (
          <button className="btn big outline" onClick={onSaved}>
            {STRINGS.profile.cancelBtn}
          </button>
        )}
      </div>
    </section>
  )
}

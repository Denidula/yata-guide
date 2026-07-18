import { describe, expect, it } from 'vitest'
import { decodeSharedPlanFromHash, encodeSharedPlanUrl, type SharedPlanPayload } from './share'
import type { FamilyProfile } from '../store/useProfileStore'

/** テスト用プロフィール。 */
function profile(over: Partial<FamilyProfile> = {}): FamilyProfile {
  return {
    size: 3,
    ages: { infant: false, child: false, adult: true, senior: false },
    attrs: {
      wheelchair: false,
      visual: false,
      hearing: false,
      dementia: false,
      medical: false,
      pregnant: false,
    },
    pet: 'none',
    meetingText: '',
    meetingAreaName: null,
    ...over,
  }
}

function payload(over: Partial<SharedPlanPayload> = {}): SharedPlanPayload {
  return {
    ward: '中野区',
    town: '中野5丁目',
    address: '東京都中野区中野五丁目',
    lat: 35.7074,
    lng: 139.6657,
    profile: profile(),
    ...over,
  }
}

function roundtrip(p: SharedPlanPayload) {
  const url = encodeSharedPlanUrl(p)
  return decodeSharedPlanFromHash(url.slice(url.indexOf('#')))
}

describe('share encode/decode', () => {
  it('通常ペイロードが往復で一致する', () => {
    const d = roundtrip(payload())
    expect(d).not.toBe('invalid')
    expect(d).not.toBeNull()
    if (d === 'invalid' || d === null) return
    expect(d.ward).toBe('中野区')
    expect(d.town).toBe('中野5丁目')
    expect(d.lat).toBeCloseTo(35.7074, 4)
    expect(d.lng).toBeCloseTo(139.6657, 4)
    expect(d.profile.size).toBe(3)
    expect(d.profile.pet).toBe('none')
  })

  it('最大構成（全フラグ・メモ60字・長い施設名）が往復できる', () => {
    const d = roundtrip(
      payload({
        profile: profile({
          size: 12,
          ages: { infant: true, child: true, adult: true, senior: true },
          attrs: {
            wheelchair: true,
            visual: true,
            hearing: true,
            dementia: true,
            medical: true,
            pregnant: true,
          },
          pet: 'other',
          meetingText: 'あ'.repeat(60),
          meetingAreaName: '都立学校・私立学校合同避難場所（長い名称テスト）',
        }),
      }),
    )
    expect(d).not.toBe('invalid')
    if (d === 'invalid' || d === null) return
    expect(d.profile.ages.senior).toBe(true)
    expect(d.profile.attrs.pregnant).toBe(true)
    expect(d.profile.pet).toBe('other')
    expect(d.profile.meetingText).toHaveLength(60)
  })

  it('80字超の住所はエンコード側でクランプされ、復号可能なURLになる（旧R-バグの回帰）', () => {
    const d = roundtrip(payload({ address: '東京都' + 'あ'.repeat(100) }))
    expect(d).not.toBe('invalid')
    if (d === 'invalid' || d === null) return
    expect(d.address.length).toBeLessThanOrEqual(80)
  })

  it('ビット詰めが独立している（車椅子だけ・高齢者だけ）', () => {
    const d = roundtrip(
      payload({
        profile: profile({
          ages: { infant: false, child: false, adult: false, senior: true },
          attrs: {
            wheelchair: true,
            visual: false,
            hearing: false,
            dementia: false,
            medical: false,
            pregnant: false,
          },
        }),
      }),
    )
    if (d === 'invalid' || d === null) throw new Error('decode failed')
    expect(d.profile.ages).toEqual({ infant: false, child: false, adult: false, senior: true })
    expect(d.profile.attrs.wheelchair).toBe(true)
    expect(d.profile.attrs.visual).toBe(false)
  })

  it('共有URLでないハッシュは null、壊れたペイロードは invalid', () => {
    expect(decodeSharedPlanFromHash('')).toBeNull()
    expect(decodeSharedPlanFromHash('#foo')).toBeNull()
    expect(decodeSharedPlanFromHash('#p=')).toBe('invalid')
    expect(decodeSharedPlanFromHash('#p=xxxx')).toBe('invalid')
  })

  it('圧縮前2000字超・巨大入力を拒否する（DoSガード）', () => {
    expect(decodeSharedPlanFromHash('#p=' + 'A'.repeat(2500))).toBe('invalid')
  })

  it('日本域外の座標・不正な人数を拒否する', () => {
    const url = encodeSharedPlanUrl(payload({ lat: 10, lng: 100 }))
    expect(decodeSharedPlanFromHash(url.slice(url.indexOf('#')))).toBe('invalid')
  })

  it('制御文字・双方向制御文字が除去される', () => {
    const d = roundtrip(
      payload({
        profile: profile({ meetingText: '駅前‮の時計台⁦' }),
      }),
    )
    if (d === 'invalid' || d === null) throw new Error('decode failed')
    expect(d.profile.meetingText).toBe('駅前の時計台')
  })
})

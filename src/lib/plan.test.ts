import { describe, expect, it } from 'vitest'
import { bfMatchCount, hasVulnerableMember, kitAttributesFor, requiredBarrierFree } from './plan'
import type { FamilyProfile } from '../store/useProfileStore'

function profile(over: Partial<FamilyProfile> = {}): FamilyProfile {
  return {
    size: 2,
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

describe('kitAttributesFor', () => {
  it('デモシナリオ「車椅子＋犬」で wheelchair と pet が立つ', () => {
    const attrs = kitAttributesFor(
      profile({
        attrs: { ...profile().attrs, wheelchair: true },
        pet: 'dog_cat',
      }),
    )
    expect(attrs).toContain('wheelchair')
    expect(attrs).toContain('pet')
    expect(attrs).not.toContain('senior')
  })

  it('全OFFなら空配列', () => {
    expect(kitAttributesFor(profile())).toEqual([])
  })

  it('年齢層から infant / senior が導出される', () => {
    const attrs = kitAttributesFor(
      profile({ ages: { infant: true, child: false, adult: true, senior: true } }),
    )
    expect(attrs).toContain('infant')
    expect(attrs).toContain('senior')
  })
})

describe('requiredBarrierFree', () => {
  it('車椅子はエレベーター/スロープ/車椅子トイレを求める', () => {
    const req = requiredBarrierFree(profile({ attrs: { ...profile().attrs, wheelchair: true } }))
    expect(req).toEqual(
      expect.arrayContaining(['elevator_or_1f', 'slope', 'wheelchair_toilet']),
    )
  })

  it('視覚障害は点字ブロックを求める・要件なしは空', () => {
    expect(requiredBarrierFree(profile({ attrs: { ...profile().attrs, visual: true } }))).toEqual([
      'braille_block',
    ])
    expect(requiredBarrierFree(profile())).toEqual([])
  })
})

describe('bfMatchCount / hasVulnerableMember', () => {
  it('求める設備のうちtrueの数を返す（null=情報なしは数えない）', () => {
    const n = bfMatchCount(
      { wheelchair_toilet: true, elevator_or_1f: null, braille_block: null, slope: true },
      ['wheelchair_toilet', 'elevator_or_1f', 'slope'],
    )
    expect(n).toBe(2)
  })

  it('要配慮メンバー判定（属性・高齢者・乳幼児で真、全OFFで偽）', () => {
    expect(hasVulnerableMember(profile())).toBe(false)
    expect(hasVulnerableMember(profile({ attrs: { ...profile().attrs, medical: true } }))).toBe(true)
    expect(
      hasVulnerableMember(profile({ ages: { infant: true, child: false, adult: true, senior: false } })),
    ).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  KIT_ATTRIBUTE_ORDER,
  KIT_BASIC,
  KIT_BY_ATTRIBUTE,
  KIT_SOURCE,
  kitSectionsFor,
} from './emergency_kit'

describe('emergency_kit master', () => {
  it('全品目キーが一意（チェック状態の保存キー衝突防止）', () => {
    const keys = [
      ...KIT_BASIC.map((i) => `basic:${i.key}`),
      ...Object.values(KIT_BY_ATTRIBUTE).flatMap((s) => s.items.map((i) => `${s.attribute}:${i.key}`)),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('基本品目は水・食料が先頭（重要度順）', () => {
    expect(KIT_BASIC[0].key).toBe('water')
    expect(KIT_BASIC[1].key).toBe('food')
  })

  it('kitSectionsFor は定義順で該当セクションだけ返す', () => {
    const sections = kitSectionsFor(['pet', 'wheelchair'])
    expect(sections.map((s) => s.attribute)).toEqual(['wheelchair', 'pet'])
    expect(kitSectionsFor([])).toEqual([])
  })

  it('9属性すべてに表示順とセクションがある', () => {
    expect(KIT_ATTRIBUTE_ORDER).toHaveLength(9)
    for (const a of KIT_ATTRIBUTE_ORDER) {
      expect(KIT_BY_ATTRIBUTE[a].items.length).toBeGreaterThan(0)
    }
  })

  it('出典と免責の表記がある', () => {
    expect(KIT_SOURCE.attribution).toContain('東京防災')
    expect(KIT_SOURCE.disclaimer).toContain('目安')
  })
})

import { describe, expect, it } from 'vitest'
import {
  activeBarrierFree,
  filterAreasByHazard,
  haversineM,
  nearest,
  nearestOne,
  walkMinutes,
  type Facility,
} from './shelters'

function facility(over: Partial<Facility>): Facility {
  return {
    kind: 'area',
    name: 'テスト施設',
    ward: '中野区',
    address: '中野1-1-1',
    lng: 139.66,
    lat: 35.7,
    bf: { wheelchair_toilet: null, elevator_or_1f: null, braille_block: null, slope: null },
    ...over,
  }
}

describe('haversineM / walkMinutes', () => {
  it('東京駅→新宿駅の直線距離が既知値（約6.2km）に近い', () => {
    // 東京駅(139.7671,35.6812) → 新宿駅(139.7006,35.6896)
    const d = haversineM(139.7671, 35.6812, 139.7006, 35.6896)
    expect(d).toBeGreaterThan(5800)
    expect(d).toBeLessThan(6600)
  })

  it('同一地点は距離0', () => {
    expect(haversineM(139.7, 35.7, 139.7, 35.7)).toBe(0)
  })

  it('徒歩分は m/80 の切り上げ・最低1分', () => {
    expect(walkMinutes(0)).toBe(1)
    expect(walkMinutes(80)).toBe(1)
    expect(walkMinutes(81)).toBe(2)
    expect(walkMinutes(800)).toBe(10)
  })
})

describe('nearest / nearestOne', () => {
  const origin = { lng: 139.66, lat: 35.7 }
  const near = facility({ name: '近い', lng: 139.661, lat: 35.7 })
  const mid = facility({ name: '中間', lng: 139.67, lat: 35.7 })
  const far = facility({ name: '遠い', lng: 139.7, lat: 35.72 })

  it('距離昇順でN件返す', () => {
    const r = nearest(origin, [far, near, mid], 2)
    expect(r.map((f) => f.name)).toEqual(['近い', '中間'])
    expect(r[0].distanceM).toBeLessThan(r[1].distanceM)
    expect(r[0].walkMin).toBeGreaterThanOrEqual(1)
  })

  it('空配列なら nearestOne は null', () => {
    expect(nearestOne(origin, [])).toBeNull()
  })
})

describe('filterAreasByHazard', () => {
  const quakeOnly = facility({
    name: '地震対応',
    disasters: {
      earthquake: true,
      flood: false,
      tsunami: false,
      storm_surge: false,
      inland_flood: false,
      landslide: false,
      fire: false,
      volcano: false,
    },
  })
  const floodOnly = facility({
    name: '洪水対応',
    disasters: {
      earthquake: false,
      flood: true,
      tsunami: false,
      storm_surge: false,
      inland_flood: false,
      landslide: false,
      fire: false,
      volcano: false,
    },
  })

  it('災害タブに対応する施設だけを返す', () => {
    expect(filterAreasByHazard([quakeOnly, floodOnly], 'quake').map((f) => f.name)).toEqual([
      '地震対応',
    ])
    expect(filterAreasByHazard([quakeOnly, floodOnly], 'flood').map((f) => f.name)).toEqual([
      '洪水対応',
    ])
    // disasters未定義（避難所）は含まれない
    expect(filterAreasByHazard([facility({})], 'quake')).toEqual([])
  })
})

describe('activeBarrierFree', () => {
  it('trueの設備だけラベル化する（null=情報なしは含めない）', () => {
    const labels = activeBarrierFree({
      wheelchair_toilet: true,
      elevator_or_1f: null,
      braille_block: true,
      slope: null,
    }).map((d) => d.key)
    expect(labels).toEqual(['wheelchair_toilet', 'braille_block'])
  })
})

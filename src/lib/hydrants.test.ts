import { describe, expect, it } from 'vitest'
import { cellOf, cellUrl, hydrantCellUrls, HYDRANT_CELL_DEG } from './hydrants'

describe('cellOf', () => {
  it('セルサイズはデータ生成スクリプト（build_hydrant_grid.py）と一致している', () => {
    // ここが変わると配信済みJSONのファイル名と噛み合わなくなるため、値そのものを固定する
    expect(HYDRANT_CELL_DEG).toBe(0.01)
  })

  it('floor(座標 / セルサイズ) でセル番号になる', () => {
    // 荒川区荒川6丁目付近
    expect(cellOf(139.7826, 35.7396)).toEqual({ cx: 13978, cy: 3573 })
  })

  it('境界のわずか手前は1つ前のセルになる', () => {
    expect(cellOf(139.7799, 35.7299)).toEqual({ cx: 13977, cy: 3572 })
  })

  it('浮動小数点の割り算結果をそのまま採用する（Python側と同じ挙動）', () => {
    // 35.73 / 0.01 は IEEE754 で 3572.9999999999995 になるため floor は 3572。
    // build_hydrant_grid.py も同じ式・同じ丸め順序なので両者は必ず一致する。
    // （ここがズレるとアプリが「点の入っていないセル」を取りに行くことになる）
    expect(cellOf(139.78, 35.73)).toEqual({ cx: 13978, cy: 3572 })
  })

  it('同一セル内のどの点でも同じセル番号になる', () => {
    expect(cellOf(139.7801, 35.7301)).toEqual(cellOf(139.7899, 35.7399))
  })
})

describe('cellUrl', () => {
  it('/data/hydrants/{cx}_{cy}.json を返す', () => {
    expect(cellUrl({ cx: 13978, cy: 3573 })).toBe('/data/hydrants/13978_3573.json')
  })
})

describe('hydrantCellUrls', () => {
  const origin = { lng: 139.7826, lat: 35.7396 }

  it('自宅を中心とした3×3セルの9件を返す', () => {
    const urls = hydrantCellUrls(origin)
    expect(urls).toHaveLength(9)
    expect(new Set(urls).size).toBe(9) // 重複なし
  })

  it('自宅のセルを必ず含む', () => {
    expect(hydrantCellUrls(origin)).toContain(cellUrl(cellOf(origin.lng, origin.lat)))
  })

  it('隣接セル（上下左右・斜め）を過不足なく含む', () => {
    const urls = hydrantCellUrls(origin)
    for (const dx of [-1, 0, 1]) {
      for (const dy of [-1, 0, 1]) {
        expect(urls).toContain(cellUrl({ cx: 13978 + dx, cy: 3573 + dy }))
      }
    }
  })
})

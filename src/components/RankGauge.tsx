import { RANK_COLOR, RANK_TEXT } from '../lib/constants'

/**
 * 5セグメントの危険度ゲージ（R1）。
 * 色覚対応の4重符号化：数値（各セグメントの1〜5）＋ランク語（呼び出し側）＋
 * 塗り量（rankぶんだけ左から塗る）＋高ランク斜線（rank4・5）。
 * 現在ランクのセグメントに黒枠＋「▼現在地」マーカー。
 */
export function RankGauge({ rank, label }: { rank: number; label: string }) {
  return (
    <div className="seg" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => {
        const on = i <= rank
        const cls = ['s', on ? 'on' : '', i === rank ? 'cur' : '', on && i >= 4 ? 'hatch' : '']
          .filter(Boolean)
          .join(' ')
        return (
          <div
            key={i}
            className={cls}
            style={on ? { backgroundColor: RANK_COLOR[i], color: RANK_TEXT[i] } : undefined}
          >
            {i}
          </div>
        )
      })}
    </div>
  )
}

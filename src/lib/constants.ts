/**
 * UI文言・定数の集約。
 * Phase2のi18n化（i18next）に備え、表示文字列は原則ここに集約する。
 * （i18next自体の導入は本フェーズでは行わない。）
 *
 * 配色トークン・ランク語はワイヤーフレーム（docs/wireframe/index.html）準拠。
 */

/** 危険度ランクの配色（色覚多様性配慮。赤緑2色に依存しない）。CSS変数名と対応。 */
export const RANK_COLOR: Record<number, string> = {
  1: '#1F6FB2', // 安全側：青
  2: '#2E9BA6', // 青緑
  3: '#E0A100', // 黄・琥珀（中間）
  4: '#E8631C', // 橙
  5: '#C31D5B', // 危険側：赤紫
}

/** ランクの前景（濃色）。 */
export const RANK_INK: Record<number, string> = {
  1: '#0E3C63',
  2: '#0E4A50',
  3: '#6B4D00',
  4: '#7A3208',
  5: '#6E0F33',
}

/** ランク語（総合危険度の表現）。 */
export const RANK_WORD: Record<number, string> = {
  1: 'とても低い',
  2: '低い',
  3: 'ふつう',
  4: '高い',
  5: '非常に高い',
}

/** 総合ランクの一言サマリ（.overall .meta の右側）。 */
export const RANK_NOTE: Record<number, string> = {
  1: '都内でも安全側',
  2: '都内でやや低め',
  3: '都内で中間',
  4: '都内でやや高め',
  5: '都内で高い',
}

/** 全町丁目数（都内順位の分母）。 */
export const TOTAL_CHOME = 5192

/** 液状化「起こりやすさ」4段階の語。 */
export const LIQ_WORD: Record<number, string> = {
  1: '低い',
  2: 'やや低い',
  3: 'やや高い',
  4: '高い',
}

/**
 * 地盤分類（12区分）→ 液状化しやすさの簡易4段階プロキシ変換。
 * §7-A：東京都に公式の液状化GISが無いため、地盤分類（震動増幅率の区分）を
 * プロキシとして参考表示する。沖積低地＝高め、台地・丘陵・山地＝低め。
 * 断定を避け「参考」に留める。
 */
export function groundToLiquefaction(ground: string): number {
  if (ground.startsWith('沖積低地')) {
    // 沖積低地1〜5：数字が大きいほど軟弱 → 3〜5は「やや高い〜高い」
    const n = parseInt(ground.replace('沖積低地', ''), 10)
    if (n >= 4) return 4 // 高い
    if (n >= 2) return 3 // やや高い
    return 3
  }
  if (ground.startsWith('谷底低地')) {
    return 2 // やや低い
  }
  if (ground.startsWith('台地')) {
    return 1 // 低い
  }
  // 丘陵・山地
  return 1
}

export const STRINGS = {
  app: {
    name: 'わが家の避難計画',
    tagline: '3秒で。／ 東京都版（デモ）',
    logo: '防',
  },

  home: {
    catchLine1: '住所を入れるだけ。',
    catchEmphasis: '3秒で',
    catchLine2: 'わが家の危険度。',
    sub: '地震のとき、わが家はどのくらい危ない？ どこへ逃げる？\n住所か現在地から、今すぐ確認できます。',
    addrLabel: '住所を入力（丁目まで）',
    addrPlaceholder: '例：荒川区荒川6丁目',
    searchBtn: '危険度を調べる',
    or: 'または',
    locBtn: '現在地から調べる',
    // 位置情報の常設注記（拒否検知後ではなく最初から見せる）
    geoHint:
      '位置情報の利用を許可できない場合も、住所入力だけで全機能を使えます。位置情報は端末内でのみ使用し、送信しません。',
    samplesLabel: 'デモ地点をタップ（実データ）',
    feat1: 'わが家の\n危険度カード',
    feat2: '災害別の\n避難先マップ',
    feat3: '機内モードでも\n使える',
    loading: '危険度を判定中…',
  },

  card: {
    addrSubSuffix: '／ 町丁目単位で判定',
    changeBtn: '住所変更',
    overallLabel: '総合危険度',
    overallScale: '1（安全側）〜 5（危険側）の相対評価',
    rankOfSuffix: 'ランク',
    bldName: '建物倒壊危険度',
    bldCapSuffix: '地震の揺れで建物が壊れやすい度合い。',
    fireName: '火災危険度',
    fireCapSuffix: '地震後に火災が広がりやすい度合い。',
    rankPrefix: 'ランク',
    orderTemplate: (order: number) => `都内順位 ${order.toLocaleString('ja-JP')}位 / ${TOTAL_CHOME.toLocaleString('ja-JP')}`,
    groundName: '地盤の分類',
    groundCap: '揺れの増幅しやすさを表す東京都の地盤区分です。',
    liqTitle: '液状化の起こりやすさ（参考）',
    liqNote:
      '液状化の公式GISデータが東京都に無いため、東京都の地盤分類（震動増幅率の区分）に基づく参考情報です。公式の液状化予測図とは異なります。',
    // 精度が代表点レベル（point.level<8）のときの注記
    coarsePrecisionNote: '丁目の代表点で判定しています（番地までは特定していません）。',
    // 次アクション（W2で地図・計画を実装。現状はプレースホルダ）
    ctaMap: '避難先を地図で見る',
    ctaPlan: 'わが家の避難計画をつくる',
    ctaComingSoon: 'この機能は準備中です（W2で実装）',
  },

  // 出典・免責フッター（disclaimer_draft.md §2-2 カードフッター短縮版）
  disclaimer: {
    home: {
      src: '出典：地震に関する地域危険度測定調査（第9回・令和4年9月公表／東京都都市整備局）ほか。',
      body: '本アプリは行政公表値をそのまま表示するもので、安全を保証するものではありません。危険度ランクは都内の相対評価です。',
    },
    // disclaimer_draft.md §2-2「カードフッター用（短縮版）」をそのまま採用
    card:
      '※行政公表データを加工した参考情報です。安全を保証するものではありません。危険度ランクは地域間の相対評価です。液状化表示は地盤分類に基づく独自の参考情報で、都公式の予測図ではありません。避難先・経路は最新状況と異なる場合があります。緊急時は行政の指示・警報を優先してください。',
  },

  errors: {
    geocodeFailed:
      '住所を特定できませんでした。丁目まで含めて入力するか、表記を変えてお試しください（例：荒川区荒川6丁目）。',
    outOfArea:
      'この地点は判定対象外です。本アプリは東京都内（島しょ部を除く）の町丁目に対応しています。',
    geoDenied:
      '位置情報を取得できませんでした。住所入力からお試しください。',
    geoUnavailable:
      'お使いの環境では位置情報を利用できません。住所入力からお試しください。',
    generic: '判定中にエラーが発生しました。もう一度お試しください。',
  },
} as const

/**
 * ホームのデモchip。demo_locations.md の4地点。
 * value=ジオコーディングに投げる住所文字列、rank=chip上のバッジ表示用。
 */
export interface DemoChip {
  key: string
  label: string
  /** ジオコーディング用の住所（実際に normalize→PIP を通す） */
  address: string
  /** chipバッジ表示用の総合ランク（表示のみ） */
  rank: number
}

export const DEMO_CHIPS: DemoChip[] = [
  { key: 'arakawa6', label: '荒川区荒川6丁目', address: '東京都荒川区荒川6丁目', rank: 5 },
  { key: 'oshiage3', label: '墨田区押上3丁目', address: '東京都墨田区押上3丁目', rank: 5 },
  { key: 'nishishinjuku2', label: '新宿区西新宿2丁目', address: '東京都新宿区西新宿2丁目', rank: 1 },
  { key: 'chiyoda', label: '千代田区（皇居）', address: '東京都千代田区千代田', rank: 1 },
]

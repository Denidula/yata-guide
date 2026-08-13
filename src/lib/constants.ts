/**
 * UI文言・定数の集約。
 * Phase2のi18n化（i18next）に備え、表示文字列は原則ここに集約する。
 * （i18next自体の導入は本フェーズでは行わない。）
 *
 * 配色トークン・ランク語は R1デザイン（docs/design_r1_source/*.dc.html）準拠。
 * 気象庁キキクル整合の「2c承認案」（青→黄→橙→赤→紫）。
 */

/** 危険度ランクの配色（色覚多様性配慮。赤緑2色に依存しない）。CSS変数 --r1..r5 と対応。 */
export const RANK_COLOR: Record<number, string> = {
  1: '#1F6FB2', // とても低い：青
  2: '#F2E700', // 低い：黄
  3: '#F58F00', // ふつう：橙
  4: '#D50000', // 高い：赤
  5: '#96009E', // 非常に高い：紫
}

/**
 * 各ランク色の上に載せる文字色（塗りバッジ・セグメント数字用）。
 * 黄(2)・橙(3)は黒字、青(1)・赤(4)・紫(5)は白字（コントラスト確保）。
 */
export const RANK_TEXT: Record<number, string> = {
  1: '#ffffff',
  2: '#1A1A1C',
  3: '#1A1A1C',
  4: '#ffffff',
  5: '#ffffff',
}

/**
 * ランクバッジ/タグのボーダー色。ランク2（黄）のみ白地で縁が消えないよう
 * 濃い黄土色にする（R1モック準拠）。他は塗りと同色。
 */
export const RANK_BORDER: Record<number, string> = {
  1: '#1F6FB2',
  2: '#B0A800',
  3: '#F58F00',
  4: '#D50000',
  5: '#96009E',
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

/**
 * ハザードタイル（PMTiles）の配信ベースURL。
 * ローカル/本番Cloudflare Pagesでは同梱の `/tiles` を指す（devはVite静的配信がRange=206に対応）。
 * 後日R2へ移す際は `.env` に `VITE_TILES_BASE_URL=https://xxx.r2.dev` を置くだけで切替できる。
 * 末尾スラッシュは付けない前提（`${TILES_BASE_URL}/chomoku_risk.pmtiles`）。
 */
export const TILES_BASE_URL: string =
  (import.meta.env.VITE_TILES_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/tiles'

/**
 * ハザードレイヤー定義（PMTilesの実ヘッダー・T5レポートで確認した実レイヤ名/属性）。
 * - chomoku_risk: Polygon / 属性 総合_ラ(1〜5), 建物_ラ, 火災_ラ, 町丁目名, 区市町村名, ID
 * - shinsui:      Point   / 属性 depth_m（0.0001〜73m, z8-12）
 * - tsunami:      Point   / 属性 depth_m, region, scenario（伊豆・小笠原諸島域。都区部には無い）
 * - takashio:     Polygon / 属性 DepthM（大文字D, 0.01〜19.36m, z8-14）
 */
export type HazardKey = 'quake' | 'flood' | 'tsunami' | 'storm'

export interface HazardDef {
  key: HazardKey
  /** タブ表示ラベル */
  label: string
  /** タブアイコン（絵文字） */
  icon: string
  /** PMTilesファイル名（TILES_BASE_URL 配下） */
  file: string
  /** PMTiles内のソースレイヤ名 */
  sourceLayer: string
}

export const HAZARDS: HazardDef[] = [
  { key: 'quake', label: '地震', icon: '🏚️', file: 'chomoku_risk.pmtiles', sourceLayer: 'chomoku_risk' },
  { key: 'flood', label: '洪水', icon: '🌊', file: 'shinsui.pmtiles', sourceLayer: 'shinsui' },
  { key: 'tsunami', label: '津波', icon: '🌀', file: 'tsunami.pmtiles', sourceLayer: 'tsunami' },
  { key: 'storm', label: '高潮', icon: '💨', file: 'takashio.pmtiles', sourceLayer: 'takashio' },
]

/**
 * 浸水深（m）の段階色（浅→深）。浸水・津波・高潮で共通。
 * 気象庁・国土地理院の浸水ランク配色（黄→橙→赤→紫）に近い、色覚配慮の順序色。
 * [しきい値(m), 色] の昇順。値がしきい値“以上”で当該色。
 */
export const DEPTH_STEPS: Array<[number, string]> = [
  [0, '#BEE3F2'], // ごく浅い（<0.5m相当の下限）
  [0.5, '#7FC6E8'], // 0.5m〜
  [1.0, '#F2D24B'], // 1.0m〜（床上目安）
  [3.0, '#EE8B3A'], // 3.0m〜（1階水没目安）
  [5.0, '#D6443C'], // 5.0m〜（2階water没目安）
  [10.0, '#8E44AD'], // 10m〜（甚大）
]

/** 凡例に出す浸水深区分の説明ラベル（DEPTH_STEPSと対応）。 */
export const DEPTH_LEGEND: Array<{ color: string; label: string }> = [
  { color: '#BEE3F2', label: '〜0.5m 未満' },
  { color: '#7FC6E8', label: '0.5〜1m' },
  { color: '#F2D24B', label: '1〜3m（床上）' },
  { color: '#EE8B3A', label: '3〜5m（1階水没）' },
  { color: '#D6443C', label: '5〜10m（2階水没）' },
  { color: '#8E44AD', label: '10m以上' },
]

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
    tagline: '2秒で。／ 東京都版（デモ）',
    logo: '防',
    scrollTop: 'ページの先頭に戻る',
  },

  home: {
    catchLine1: '住所を入れるだけ。',
    catchEmphasis: '2秒で',
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
    loadingCancel: 'キャンセル',
    /**
     * 現在地判定時の表示住所。ローカルPIPで特定した町丁目を添える
     * （逆ジオコーディングは使わない＝GPS座標を外部送信しない方針のまま。R2レビュー決定）
     */
    currentLocationAt: (wardTown: string) => `現在地（${wardTown}）`,
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
    // 東京都は「東京の液状化予測図」（250mメッシュ・3段階）を公表しているが、面データの配布が無く
    // 再利用の許諾も付かないため、本アプリは地盤分類からの独自プロキシを出している。
    // 利用者が都の予測図と見比べて食い違う可能性があるので、別物である旨は必ず添える。
    liqNote:
      '東京都の地盤分類（震動増幅率の区分）に基づく参考情報で、東京都公表の液状化予測図とは異なります。',
    // 精度が代表点レベル（point.level<8）のときの注記
    // PIPが近傍スナップ（ポリゴン外→約50m以内の最寄り町丁目に割当）だったときの注記
    snappedNote:
      '入力地点が町丁目区域のわずかに外だったため、最も近い町丁目のデータで判定しています。',
    // 次アクション（W2で地図を実装。計画はプレースホルダのまま）
    ctaMap: '避難先を地図で見る',
    ctaPlan: 'わが家の避難計画をつくる',
    // 避難先サマリー（カード内。地震を主導線とする）
    evacTitle: 'いざというときの避難先',
    evacAreaLabel: '地震のとき近い避難場所',
    evacCenterLabel: '最寄りの避難所（生活避難）',
    evacAreaNote: '災害の危険から身を守るために一時的に逃げる場所です。',
    evacCenterNote: '自宅で生活できないときに滞在する場所です。',
    evacNone: '周辺に該当する避難場所の公表データが見つかりませんでした。',
    // 永続化した前回結果を復元表示しているときのラベル＋再判定導線
    restoredLabel: '前回の判定結果',
    restoredNote: 'この端末に保存された前回の結果です。最新の状況で確認するには再判定してください。',
    rejudgeBtn: '別の住所で調べ直す',
  },

  // オフライン関連（バナー・注記）
  offline: {
    banner: 'オフライン：保存済みデータで表示中。住所の新規検索にはネット接続が必要です。',
  },

  // 下部タブバー（ホーム/危険度/計画/地図の4タブ）
  tabs: {
    home: 'ホーム',
    card: '危険度',
    plan: '計画',
    map: '地図',
  },

  // 地図画面
  map: {
    // section-label（表示中の災害種別＋地点）
    sectionPrefix: '避難先マップ',
    // 災害種別タブのラベルはHAZARDSを使用
    // 凡例
    legendTitle: '凡例',
    legendRankHigh: '総合危険度 高（ランク5）',
    legendRankMid: '同 中（ランク3）',
    legendYou: 'わが家（判定した地点）',
    legendNoData: '空欄＝情報なし・非該当の区別不能',
    quakeLegendTitle: '地域危険度（総合ランク）',
    depthLegendTitle: '浸水の深さ（想定最大）',
    // 島しょ部データしか無い津波レイヤーで都区部を表示したときの注記
    tsunamiMainlandNote:
      '津波浸水想定は伊豆・小笠原諸島の対象区域データです。この地点周辺には表示データがありません。',
    // グレースフルデグレード（本番Range非対応環境）
    degradeBanner: 'ハザードレイヤーは配信準備中です。ベース地図とわが家の位置のみ表示しています。',

    // 避難先（避難場所＝緑ピン／避難所＝青ピン）
    evacAreaWord: '避難場所',
    evacCenterWord: '避難所',
    evacAreaSub: '災害時に逃げる先',
    evacCenterSub: '生活避難の先',
    // 最寄りリスト
    nearListTitle: (label: string) => `${label}のとき近い避難場所`,
    nearListCenterTitle: '最寄りの避難所（生活避難）',
    nearListEmpty: (label: string) => `この地点の周辺に「${label}」対応の避難場所データが見つかりませんでした。`,
    // 距離・徒歩分の表記（例：約320m・徒歩4分）
    distFmt: (m: number, min: number) =>
      m >= 1000 ? `約${(m / 1000).toFixed(1)}km・徒歩約${min}分` : `約${Math.round(m)}m・徒歩約${min}分`,
    walkNote: '（直線距離。実際の経路距離とは異なります）',
    // ポップアップ
    popKindArea: '避難場所',
    popKindCenter: '避難所',
    popDisasterLabel: '対応災害',
    popBfLabel: 'バリアフリー',
    popBfNone: '情報なし',
    popKindHospital: '災害拠点病院',
    popKindHospitalRenkei: '災害拠点連携病院',
    popKindHydrant: '消火栓',
    popTelLabel: '電話',
    popAreaLabel: '二次保健医療圏',
    popTertiaryEr: '三次救急（救命救急センター等）',
    popHydrantNote: '公設上水道消火栓（防火水槽は含みません）',
    popCloseLabel: '詳細を閉じる',
    // 凡例（避難先ピン）
    legendEvacArea: '避難場所（災害時に逃げる先）',
    legendEvacCenter: '避難所（生活避難の先）',
    legendHospital: '災害拠点病院・連携病院（重症者の受け入れ先）',
    // 消火栓は表示条件（拡大時・自宅周辺のみ）を凡例ラベル自体に畳み込み、注記の行を減らしている
    legendHydrant: '消火栓（拡大時・わが家の周辺2km四方のみ）',
    // 地図の拡大表示（小さい端末でスクロールせずに地図を見るためのモード）
    expandBtn: '地図を拡大表示',
    collapseBtn: '拡大表示を終了',
    legendShow: '凡例を見る',
    legendHide: '凡例を閉じる',
    // 出典（地図下部フッター。disclaimer_draft.md §地図画面の出典）
    attribution:
      '出典：地域危険度（第9回・東京都都市整備局）／浸水予想区域図（東京都建設局）／津波浸水分布（東京都総務局）／高潮浸水想定区域図（東京都港湾局）／避難所・避難場所一覧（東京都総務局）／災害拠点病院等（東京都保健医療局）／公設消火栓情報（東京消防庁）／背景地図＝国土地理院。座標変換・タイル化・ランク色分け・住所からの座標付与等の加工を行った参考情報で、各発表元が作成した情報ではありません。',
  },

  // 家族プロフィール入力（W1。入力値は端末内IndexedDBのみ＝送信ゼロ）
  profile: {
    title: 'わが家の情報',
    lead: '家族に合わせた避難計画カードを作ります。',
    sizeLabel: '世帯人数',
    sizeUnit: '人',
    agesLabel: '家族の年齢層',
    agesHint: 'あてはまるものすべて',
    ageInfant: '乳幼児',
    ageChild: '小中学生',
    ageAdult: '大人',
    ageSenior: '高齢者',
    attrsLabel: '配慮が必要な家族',
    attrsHint: 'あてはまるものすべて',
    attrWheelchair: '車椅子を使う',
    attrVisual: '目が不自由',
    attrHearing: '耳が不自由',
    attrDementia: '認知症・要介護',
    attrMedical: '在宅医療機器を使う',
    attrPregnant: '妊娠中・産後',
    petLabel: 'ペット',
    petNone: 'いない',
    petDogCat: '犬・猫',
    petOther: 'その他',
    meetingLabel: '家族の集合場所',
    meetingHint: 'はぐれたときに落ち合う場所をメモできます（任意）',
    meetingPlaceholder: '例：○○公園の時計台の前',
    meetingPickLabel: '近くの避難場所から選ぶ（任意）',
    meetingPickNone: '選択しない',
    submitBtn: '計画カードをつくる',
    updateBtn: '計画カードを更新する',
    cancelBtn: 'もどる',
    privacyNote: '入力内容はこの端末の中だけに保存され、外部のサーバーには一切送信されません。',
    loading: '保存した情報を読み込み中…',
  },

  // マイ避難計画カード（W1）
  plan: {
    title: 'マイ避難計画カード',
    forAddressSuffix: 'の計画',
    editProfileBtn: '家族情報を変える',
    // 避難先（優先順）
    evacTitle: '避難先（優先順）',
    stepArea: 'まず逃げる',
    stepAreaSub: '地震のとき身を守る避難場所',
    // 避難場所までのルート確認（外部の地図アプリへ遷移）。
    // 渡すのは目的地（公表データの公共施設）の座標だけで、自宅の座標は渡さない。
    // 現在地は遷移先の地図アプリが本人の許可で取得する＝本アプリは位置情報を外部送信しない。
    // 位置関係の静止画（オフラインでも見える。planMapImage.ts で端末内描画）
    mapImgAlt: (name: string) => `わが家と${name}の位置を示した地図`,
    mapImgLoading: '地図を準備中…',
    routeBtn: 'ここまでのルートを確認する',
    routeNote: '外部の地図アプリが開きます（通信が必要）。',
    routeOfflineNote: 'ルート表示には通信が必要です。オフラインのときは地図タブで位置を確認してください。',
    stepCenter: '生活避難する',
    stepCenterSub: '自宅で生活できないときの避難所',
    bfBadge: 'バリアフリー',
    bfPriorityNote: '車椅子・介護に配慮し、バリアフリー設備が公表されている避難所を優先しています。',
    bfPlainLabel: '参考：無条件の最寄り',
    bfNoMatch: '周辺にバリアフリー設備の公表がある避難所が見つかりませんでした。最寄りの避難所を表示しています。',
    stepFukushi: '福祉避難所',
    stepFukushiSub: '二次避難所（開設後に案内）',
    stepHospital: 'けが・急病のとき',
    stepHospitalSub: '重症者を受け入れる災害拠点病院',
    evacNone: '周辺に該当する避難先の公表データが見つかりませんでした。',
    // 生成中表示（L-14: 「保存した情報を読み込み中…」の流用をやめ実態に合わせる）
    building: '計画カードを作成中…',
    // BF設備表示のプレフィックス（L-16）
    bfEquipPrefix: '設備：',
    bfEquipUnknown: '公表情報あり',
    // 持ち出し品
    kitTitle: '非常用持ち出し品',
    kitBasicTitle: '基本の品目（全員共通）',
    kitCount: (n: number) => `${n}品目`,
    // 集合場所
    meetingTitle: '家族の集合場所',
    meetingEmpty: '未設定。「家族情報を変える」から追加できます。',
  },

  // マスコット「やっくん」（タップで現在ページのかんたん説明。R2レビューの遊び心枠）
  yakkun: {
    // 読み上げ用のラベルには名前を残す（誰を押すのかが音声だけでは分からないため）。
    // 吹き出し内の名前見出しは廃止したので name は持たない。
    ariaLabel: 'やっくん（このページのかんたん説明）',
    byView: {
      home: 'ここはホーム！住所を入れるか、下のデモ地点を押すと、おうちの危険度を2秒で調べるよ。',
      card: 'これはおうちの危険度カード。ランクは都内の中での比べっこだよ。下のボタンから避難計画も作れる！',
      plan: 'ここは避難計画のページ。家族のことを教えてくれたら、合う避難先と持ち出し品をぼくが選ぶよ。QRで家族にも渡してね！',
      map: '災害の種類ごとに、危ない場所と避難先を地図で見られるよ。緑のピンが避難場所、青が避難所！',
    } as Record<'home' | 'card' | 'plan' | 'map', string>,
  },

  // 災害モード＝自宅周辺タイルのプリキャッシュ（W3）
  offlinePack: {
    title: '災害モード（オフライン対応）',
    running: (done: number, total: number) => `自宅周辺の地図を保存中… ${done}/${total}`,
    doneNote: (when: string) =>
      `自宅周辺の地図を保存済み（${when}）。電波がない状況でも危険度カード・計画カード・地図を表示できます。`,
    partialNote: '一部のタイルを保存できませんでした。電波の良い場所で「保存し直す」を押してください。',
    errorNote: '地図を保存できませんでした。オンラインの状態で「保存し直す」を押してください。',
    idleNote: 'オンラインになると自宅周辺の地図を自動保存します。',
    redoBtn: '保存し直す',
  },

  // 計画カードの共有（W2。URL#=サーバー非送信、本人の意思による手渡し共有）
  share: {
    openBtn: 'QRで家族に渡す',
    closeBtn: '共有を閉じる',
    title: 'この計画カードを共有',
    lead: 'QRを読み取るか、リンクを送ると同じ計画カードを表示できます。',
    qrAlt: '計画カード共有用QRコード',
    shareBtn: 'リンクを共有',
    copiedNote: 'リンクをコピーしました',
    saveImgBtn: 'QR画像を保存',
    // 技術的には「URLのフラグメント（#以降）はサーバーに送られない」という仕組みだが、
    // 利用者にとっては用語でしかないので、事実（この情報は外部に出ない）だけを書く。
    privacyNote:
      'リンクには家族構成と住所の情報が含まれます。渡したい相手にだけ共有してください（この情報が外部のサーバーに送信されることはありません）。',
    // 受信側（閲覧モード）
    receivedLabel: '受け取った計画カード',
    receivedNote: 'このカードは共有されたものです。内容を確認し、自分の端末に保存できます。',
    adoptBtn: 'この計画を自分の端末に保存',
    adoptConfirm:
      '受け取った計画（家族構成と地点）をこの端末に保存します。今の入力内容は上書きされます。よろしいですか？',
    adoptFailed: 'この計画の地点を判定できませんでした（対応エリア外の可能性があります）。',
    discardBtn: '保存せずに閉じる',
    invalidNote: '共有リンクを読み取れませんでした。URLが途中で切れていないか確認してください。',
    backBtn: 'アプリへ',
  },

  // 福祉避難所（二次避難所）。W1の計画カードで使用（shelters.ts の findFukushiLink と対）
  // 施設一覧はアプリに収録せず、区市の公表ページへ案内する（リンク導線）。
  fukushi: {
    word: '福祉避難所',
    sub: '要配慮者のための二次避難先',
    // 「直接向かう場所」と誤解させないための必須注記。福祉避難所の表示には必ず添える
    roleNote:
      '福祉避難所は最初から向かう場所ではなく、災害後に自治体が開設し、必要と判断された方が案内される「二次避難先」です。まずは最寄りの避難所へ避難してください。',
    // リンク導線の導入文・ボタン・注記
    linkLead: (muni: string) =>
      `福祉避難所は${muni}が指定・公表しています。どの施設が指定されているかは、${muni}の公表ページでご確認ください。`,
    linkBtn: (muni: string) => `${muni}の福祉避難所ページを開く`,
    linkNote: '外部サイト（区市の公式ページ）が開きます（通信が必要）。',
    linkOfflineNote:
      '区市の公表ページを開くには通信が必要です。電波のある場所で確認してください。',
    // 案内先を用意できていない区市の正直表示
    notCovered: (muni: string) =>
      `${muni}の福祉避難所については、このアプリでご案内できる公表ページを確認できていません。お住まいの自治体の防災窓口にご確認ください。`,
    attribution:
      '福祉避難所は各区市が指定・公表しています。本アプリは施設一覧を収録せず、各区市の公表ページへご案内しています。指定内容・開設状況は災害時の自治体発表が優先されます。',
  },

  // 災害拠点病院・災害拠点連携病院。計画カードと地図で使用（shelters.ts の findNearestHospitals と対）
  hospital: {
    word: '災害拠点病院',
    renkeiWord: '災害拠点連携病院',
    sub: '重症者を受け入れる災害医療の拠点',
    // 軽症者の直行を防ぐための必須注記。病院の表示には必ず添える
    roleNote:
      '災害拠点病院は重症者を受け入れる病院です。軽いけがで自己判断して向かうと重症者の治療を妨げます。まずは避難所の救護所や地域の医療救護活動で手当てを受けてください。',
    telNote: '災害時は電話がつながりにくくなります。番号は平常時の確認用です。',
    attribution:
      '出典：東京都保健医療局「災害拠点病院一覧」「災害拠点連携病院一覧」を加工。元データに緯度経度が無いため、住所から座標を独自に付与しています（施設によっては街区単位の概略位置です）。',
  },

  // 消火栓。危険度カード（火災）と地図で使用（hydrants.ts と対）
  hydrant: {
    word: '消火栓',
    nearestLabel: '最寄りの消火栓',
    loading: '確認中…',
    // 用途を誤解させないための注記
    roleNote:
      '消火栓は消防隊やスタンドパイプ等での初期消火に使う設備です。位置は公設の上水道消火栓のみで、防火水槽は含まれていません。',
    failed: '消火栓データを取得できませんでした。',
    // 島しょ部は東京消防庁の管轄外でデータが存在しない（取得失敗と区別して表示する）
    none: 'この地点の周辺には公表データがありません',
    attribution: '出典：東京消防庁「消火栓及び防火水槽等（公設消火栓情報）」を加工。公設上水道消火栓のみを収録しています。',
  },

  // 出典・免責フッター（disclaimer_draft.md §2-2 カードフッター短縮版）
  disclaimer: {
    home: {
      src: '出典：地震に関する地域危険度測定調査（第9回・令和4年9月公表／東京都都市整備局）ほか。',
      body: '本アプリは行政公表値をそのまま表示するもので、安全を保証するものではありません。危険度ランクは都内の相対評価です。住所検索時は、住所を座標へ変換するため国土地理院の検索サービスへ問い合わせる場合があります（位置情報＝GPSの座標は送信しません）。',
    },
    // disclaimer_draft.md §2-2「カードフッター用（短縮版）」をそのまま採用
    card:
      '※行政公表データを加工した参考情報です。安全を保証するものではありません。危険度ランクは地域間の相対評価です。液状化表示は地盤分類に基づく独自の参考情報で、都公式の予測図ではありません。避難先・経路は最新状況と異なる場合があります。緊急時は行政の指示・警報を優先してください。',
  },

  errors: {
    geocodeFailed:
      '住所を特定できませんでした。丁目まで含めて入力するか、表記を変えてお試しください（例：荒川区荒川6丁目）。',
    geocodeOffline:
      'オフラインのため住所を検索できませんでした。住所の新規検索にはネット接続が必要です。接続後にもう一度お試しください（前回の判定結果は接続なしでも表示できます）。',
    outOfArea:
      'この地点は判定対象外です。本アプリは東京都内（島しょ部を除く）の町丁目に対応しています。',
    geoDenied:
      '位置情報の利用が許可されていません。端末の設定（位置情報サービス→ブラウザまたはこのアプリ）で許可するか、住所入力からお試しください。',
    geoFailed:
      '位置情報を取得できませんでした（電波状況や屋内では失敗することがあります）。もう一度試すか、住所入力からお試しください。',
    geoUnavailable:
      'お使いの環境では位置情報を利用できません。住所入力からお試しください。',
    generic: '判定中にエラーが発生しました。もう一度お試しください。',
    backBtn: '住所入力にもどる',
  },
} as const

/**
 * ホームのデモchip。総合ランク 5 / 3 / 1 を1つずつ（3地点）。
 * ゲージが 5/5/5 → 3/3/3 → 1/1/1 と階段状に変わるデモになる。
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
  { key: 'nakano5', label: '中野区中野5丁目', address: '東京都中野区中野5丁目', rank: 3 },
  { key: 'chiyoda', label: '千代田区（皇居）', address: '東京都千代田区千代田', rank: 1 },
]

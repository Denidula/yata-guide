/**
 * emergency_kit.ts — 非常用持ち出し品マスター（P2-W0a）。
 *
 * 『東京防災』（東京都総務局総合防災部）・東京都防災ホームページ・東京都心身障害者福祉センターの
 * 防災マニュアル・環境省「人とペットの災害対策ガイドライン」等の公的資料の公開情報を参考に、
 * 品目の選定・文言とも本アプリが独自に再構成したもの（原文の転載ではない）。
 * 主な確認元:
 *  - 東京都防災ホームページ「災害が起きる前に（自宅編）」 bousai.metro.tokyo.lg.jp/bousai/1000027/1000286.html
 *  - 東京都「要配慮者への支援」 bousai.metro.tokyo.lg.jp/bousai/1000027/1000303.html
 *  - 都心身障害者福祉センター「目の不自由な方／耳の不自由な方のための防災マニュアル」
 *  - 東京都保健医療局「在宅人工呼吸器使用者のための災害時個別支援計画」「ペットの防災」
 *  - 環境省「災害、あなたとペットは大丈夫？」／中野区「妊産婦・乳幼児のための災害の備え」
 * 注意: 車椅子使用者・認知症の方の個人携行品は行政一次資料に明確な品目列挙が無く、
 * 当事者団体等で広く推奨される一般的な内容で補完している（KIT_SOURCE.disclaimer が前提）。
 *
 * W1 のルールエンジン（plan.ts）が家族プロフィールの属性チェックから
 * kitSectionsFor() で該当セクションを引き、基本品目＋属性別追加のチェックリストを組み立てる。
 */

/** 品目1件。key はチェック状態の保存キー（IndexedDB）に使うため安定させること。 */
export interface KitItem {
  key: string
  /** 表示名 */
  label: string
  /** 数量・選び方の目安（任意） */
  note?: string
}

/**
 * 属性キー。W1 の家族プロフィールのチェック項目と1:1で対応させる。
 * senior のみチェックではなく年齢層（高齢者が含まれるか）から導出する想定。
 */
export type KitAttribute =
  | 'infant' // 乳幼児
  | 'senior' // 高齢者
  | 'wheelchair' // 車椅子使用
  | 'visual' // 視覚障害
  | 'hearing' // 聴覚障害
  | 'dementia' // 認知症・要介護
  | 'medical' // 在宅医療機器の使用（酸素・人工呼吸器・透析など）
  | 'pregnant' // 妊産婦
  | 'pet' // ペット（犬・猫など）

/** 属性別の追加品目セクション。 */
export interface KitSection {
  attribute: KitAttribute
  /** セクション見出し（例: 乳幼児のいるご家庭） */
  title: string
  items: KitItem[]
}

/** 基本の持ち出し品（全員共通）。並びは重要度順（水・食料・トイレが先頭）。 */
export const KIT_BASIC: KitItem[] = [
  { key: 'water', label: '飲料水', note: '1人1日3Lが目安。持ち出し用は最低でも1〜2日分' },
  { key: 'food', label: '非常食', note: 'そのまま食べられるもの（レトルト・缶詰・栄養補助食品など）を3日分' },
  { key: 'portable_toilet', label: '携帯トイレ・簡易トイレ', note: '1人1日5回分が目安' },
  { key: 'mobile_battery', label: 'モバイルバッテリー・充電ケーブル', note: '手回し充電式ならなお安心' },
  { key: 'flashlight', label: '懐中電灯', note: '予備の電池とセットで' },
  { key: 'radio', label: '携帯ラジオ', note: '停電時の情報収集に。手回し式が便利' },
  { key: 'first_aid', label: '救急セット', note: 'ばんそうこう・消毒液・包帯など' },
  { key: 'medicine', label: '常備薬・お薬手帳のコピー', note: '薬は最低3日分、できれば1週間分' },
  { key: 'cash', label: '現金', note: '停電時はカードが使えないことも。小銭も忘れずに' },
  { key: 'id_copy', label: '身分証・健康保険証のコピー' },
  { key: 'hygiene', label: 'マスク・除菌シートなど衛生用品' },
  { key: 'sanitary', label: '生理用品' },
  { key: 'gloves', label: '軍手・厚手の手袋' },
  { key: 'whistle', label: 'ホイッスル', note: '閉じ込められたとき居場所を知らせる' },
  { key: 'rain_cold', label: '雨具・防寒具', note: '携帯カイロ・ポンチョなど' },
  { key: 'helmet', label: 'ヘルメット・防災頭巾' },
  { key: 'clothes', label: '着替え・下着・タオル' },
  { key: 'warm_sheet', label: 'アルミシートなど保温できるもの' },
  { key: 'lighter', label: 'ライター・マッチ' },
  { key: 'stationery', label: '筆記用具・油性ペン', note: '安否メモや伝言に' },
]

/** 属性別の追加品目。表示順は KIT_ATTRIBUTE_ORDER に従う。 */
export const KIT_BY_ATTRIBUTE: Record<KitAttribute, KitSection> = {
  infant: {
    attribute: 'infant',
    title: '乳幼児のいるご家庭',
    items: [
      { key: 'milk', label: '粉ミルク・液体ミルク', note: 'アレルギー対応の要否も確認' },
      { key: 'baby_bottle', label: '哺乳びん', note: '使い捨てタイプや紙コップでも代用可' },
      { key: 'baby_food', label: '離乳食・おやつ' },
      { key: 'diapers', label: '紙おむつ・おしりふき' },
      { key: 'mother_child_book', label: '母子健康手帳', note: 'コピーやスマホ撮影でも' },
      { key: 'baby_clothes', label: '子どもサイズの着替え・防寒着' },
    ],
  },
  senior: {
    attribute: 'senior',
    title: '高齢の方',
    items: [
      { key: 'denture', label: '入れ歯・洗浄剤', note: '水を使わない洗浄シートも便利' },
      { key: 'care_supplies', label: '大人用おむつなど介護用品' },
      { key: 'soft_food', label: 'おかゆなど食べやすい非常食' },
      { key: 'cane', label: '使い慣れた杖' },
      { key: 'reading_glasses', label: '老眼鏡・補聴器の予備電池', note: '使用している場合' },
    ],
  },
  wheelchair: {
    attribute: 'wheelchair',
    title: '車椅子を使う方',
    items: [
      { key: 'wc_battery', label: '予備バッテリー', note: '電動車椅子の場合。充電手段も確認' },
      { key: 'wc_repair', label: '空気入れ・簡易修理用品' },
      { key: 'wc_cushion', label: '体圧分散用クッション', note: '長時間の避難生活の床ずれ予防に' },
      { key: 'wc_slope', label: '携帯スロープ', note: '段差の多い経路を通る場合' },
    ],
  },
  visual: {
    attribute: 'visual',
    title: '目の不自由な方',
    items: [
      { key: 'white_cane', label: '白杖の予備' },
      { key: 'voice_device', label: '音声時計など音声で使える機器' },
      { key: 'disability_id', label: '障害者手帳・受給者証のコピー' },
      { key: 'spare_glasses', label: 'メガネ・コンタクトレンズの予備', note: '弱視の場合' },
    ],
  },
  hearing: {
    attribute: 'hearing',
    title: '耳の不自由な方',
    items: [
      { key: 'hearing_aid', label: '補聴器と予備電池' },
      { key: 'writing_tools', label: '筆談ボード・メモ帳とペン' },
      { key: 'comm_board', label: '指差しで伝えられるコミュニケーションカード' },
      { key: 'hearing_id', label: '障害者手帳のコピー', note: '支援を受けやすくするため' },
    ],
  },
  dementia: {
    attribute: 'dementia',
    title: '認知症・介護が必要な方',
    items: [
      { key: 'emergency_card', label: '緊急連絡カード', note: '氏名・連絡先・持病を書いた耐水のカード' },
      { key: 'med_info', label: '服薬情報・お薬手帳のコピー' },
      { key: 'care_id', label: '介護保険証のコピー' },
      { key: 'familiar_item', label: '使い慣れた小物', note: '環境の変化による不安を和らげる' },
    ],
  },
  medical: {
    attribute: 'medical',
    title: '在宅医療機器を使う方',
    items: [
      { key: 'backup_power', label: '予備電源・外部バッテリー', note: '人工呼吸器・在宅酸素などの停電対策' },
      { key: 'medical_card', label: '医療情報カード', note: '病名・治療内容・使用機器を書いたもの' },
      { key: 'hospital_list', label: 'かかりつけ・代替医療機関の連絡先リスト', note: '透析患者は代替透析先も' },
      { key: 'med_supplies', label: '機器の消耗品・予備部品', note: '必要量は主治医と相談' },
    ],
  },
  pregnant: {
    attribute: 'pregnant',
    title: '妊娠中・産後の方',
    items: [
      { key: 'maternity_book', label: '母子健康手帳', note: 'コピーやスマホ撮影でも' },
      { key: 'maternity_pads', label: '生理用品・産じょくパッド' },
      { key: 'belly_band', label: '腹帯・骨盤ベルト' },
      { key: 'newborn_set', label: '新生児用品', note: '出産が近い場合。おむつ・肌着など' },
      { key: 'nursing_cape', label: '授乳ケープ' },
    ],
  },
  pet: {
    attribute: 'pet',
    title: 'ペットと一緒に避難する方',
    items: [
      { key: 'pet_food', label: 'ペットフード・水', note: '5日分以上（できれば7日分）' },
      { key: 'pet_carry', label: '首輪・リード・キャリーバッグ', note: '同行避難の必需品' },
      { key: 'pet_toilet', label: 'ペットシーツなど排泄用品' },
      { key: 'pet_photo', label: '飼い主と一緒に写った写真', note: 'はぐれたときの身元確認に' },
      { key: 'pet_records', label: 'ワクチン接種歴・健康記録' },
      { key: 'pet_meds', label: 'ペットの常備薬・療法食', note: 'ある場合' },
    ],
  },
}

/** 属性セクションの表示順（プロフィール画面のチェック順と揃える）。 */
export const KIT_ATTRIBUTE_ORDER: KitAttribute[] = [
  'infant',
  'senior',
  'wheelchair',
  'visual',
  'hearing',
  'dementia',
  'medical',
  'pregnant',
  'pet',
]

/** 該当する属性の追加品目セクションを表示順で返す（W1 のルールエンジンから呼ぶ）。 */
export function kitSectionsFor(attributes: KitAttribute[]): KitSection[] {
  const set = new Set(attributes)
  return KIT_ATTRIBUTE_ORDER.filter((a) => set.has(a)).map((a) => KIT_BY_ATTRIBUTE[a])
}

/** マスター全体の出典表記と免責（チェックリスト表示時に必ず添える）。 */
export const KIT_SOURCE = {
  attribution:
    '参考：『東京防災』（東京都総務局総合防災部）、東京都防災ホームページ、環境省「人とペットの災害対策ガイドライン」ほか公的資料。品目と文言は本アプリが独自に再構成したものです。',
  disclaimer:
    '一般的な目安のリストです。家族の人数・年齢・体質・住環境に合わせて増減し、内容は定期的に見直してください。',
} as const

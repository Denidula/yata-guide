import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { idbGet, idbSet, idbDel } from '../lib/idb'

/**
 * useProfileStore — 家族プロフィール（P2-W1）。
 *
 * 保存先は IndexedDB（lib/idb.ts）。localStorage は使わない（phase2_spec.md §2:
 * 個人情報は端末内のみ・サーバー送信ゼロ。容量とプライバシーの整理のため）。
 * 保持するのは「世帯にどの層・属性の人がいるか」のフラグと人数だけで、
 * 氏名・生年月日など個人を特定できる情報は持たない設計。
 */

/** 年齢層（世帯にいる層のチェック。人数までは持たない） */
export interface AgeBands {
  /** 乳幼児（未就学） */
  infant: boolean
  /** 小中学生 */
  child: boolean
  /** 大人 */
  adult: boolean
  /** 高齢者（65歳〜目安） */
  senior: boolean
}

/** 要配慮属性（プロフィール画面のチェック項目） */
export interface CareAttrs {
  /** 車椅子を使う人がいる */
  wheelchair: boolean
  /** 目の不自由な人がいる */
  visual: boolean
  /** 耳の不自由な人がいる */
  hearing: boolean
  /** 認知症・要介護の人がいる */
  dementia: boolean
  /** 在宅医療機器（酸素・人工呼吸器・透析等）を使う人がいる */
  medical: boolean
  /** 妊娠中・産後の人がいる */
  pregnant: boolean
}

/** ペット（犬猫=同行避難の一般ケース／その他=小動物など） */
export type PetType = 'none' | 'dog_cat' | 'other'

export interface FamilyProfile {
  /** 世帯人数（1〜12） */
  size: number
  ages: AgeBands
  attrs: CareAttrs
  pet: PetType
  /** 家族の集合場所（自由記述1行） */
  meetingText: string
  /** 避難場所リストから選んだ集合場所の施設名（未選択は null） */
  meetingAreaName: string | null
}

/** フォームの初期値（すべて未チェック・大人1人）。 */
export function emptyProfile(): FamilyProfile {
  return {
    size: 1,
    ages: { infant: false, child: false, adult: true, senior: false },
    attrs: { wheelchair: false, visual: false, hearing: false, dementia: false, medical: false, pregnant: false },
    pet: 'none',
    meetingText: '',
    meetingAreaName: null,
  }
}

interface ProfileState {
  /** 保存済みプロフィール（null = 未作成） */
  profile: FamilyProfile | null
  /**
   * IndexedDB からの復元が完了したか。
   * 復元完了前に計画画面を開いた場合は読み込み表示にする（フォームを空で初期化しない）。
   */
  hydrated: boolean
  saveProfile: (p: FamilyProfile) => void
  clearProfile: () => void
}

/** zustand persist 用の IndexedDB アダプタ。失敗しても致命にしない（保存なしで続行）。 */
const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return (await idbGet<string>(name)) ?? null
    } catch {
      return null
    }
  },
  setItem: async (name, value) => {
    try {
      await idbSet(name, value)
    } catch {
      // プライベートブラウズ等。保存できないだけで機能は続行。
    }
  },
  removeItem: async (name) => {
    try {
      await idbDel(name)
    } catch {
      // 同上
    }
  },
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profile: null,
      hydrated: false,
      saveProfile: (p) => set({ profile: p }),
      clearProfile: () => set({ profile: null }),
    }),
    {
      name: 'yata-guide-profile',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ profile: s.profile }),
      // 復元完了（エラー時も完了扱い）でフォーム初期化を解禁する。
      // 直接代入（state.hydrated = true）はzustandの変更通知に乗らず、購読者
      // （share.ts の waitForProfileHydration 等）へ復元完了が伝わらない（レビューM-6）。
      // IndexedDBの復元は非同期で create() 完了後に解決するため、ここでの setState 参照は安全。
      onRehydrateStorage: () => () => {
        useProfileStore.setState({ hydrated: true })
      },
    },
  ),
)

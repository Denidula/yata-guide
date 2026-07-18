import { defineConfig } from 'vitest/config'

/**
 * vitest設定（レビュー提案の品質基盤）。
 * 対象は src/lib・src/data の純関数ロジック（share符号化・距離計算・ルールエンジン等）。
 * share.ts が window.location / localStorage を参照するため jsdom 環境で回す
 * （IndexedDBはjsdomに無いが、idb.ts側のtry/catchで劣化するのでテストには影響しない）。
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})

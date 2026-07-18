/**
 * idb.ts — IndexedDB の最小 Promise KVラッパ（新依存を増やさない方針で自前実装）。
 *
 * 家族プロフィール等の個人情報の保存先。設計方針（phase2_spec.md §2）:
 *  - 個人情報は端末内のみ・サーバー送信ゼロ。localStorage は容量とプライバシー整理のため使わない。
 *  - プライベートブラウズ等で IndexedDB が使えない環境では呼び出し側が握りつぶし、
 *    保存なし（その場限り）で動作を続ける。
 */

const DB_NAME = 'yata-guide'
const DB_VERSION = 1
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => {
      const db = req.result
      // 将来のスキーマ更新時に他タブがアップグレードをブロックしないよう自分から閉じる
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('IndexedDB open failed'))
    }
    // 将来DB_VERSIONを上げた際、旧接続を保持する他タブがあると open が無期限pendingになる。
    // 失敗として解決し、呼び出し側の劣化動作（保存なし続行）に落とす（レビューL-2）。
    req.onblocked = () => {
      dbPromise = null
      reject(new Error('IndexedDB open blocked by another tab'))
    }
  })
  return dbPromise
}

function toPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

/** キーの値を取得（無ければ undefined）。 */
export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb()
  return (await toPromise(db.transaction(STORE, 'readonly').objectStore(STORE).get(key))) as T | undefined
}

/** キーに値を保存（上書き）。 */
export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  await toPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key))
}

/** キーを削除。 */
export async function idbDel(key: string): Promise<void> {
  const db = await openDb()
  await toPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key))
}

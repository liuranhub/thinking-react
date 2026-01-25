/**
 * 认证相关的工具函数
 * 使用 IndexedDB 存储 Authorization
 */

const DB_NAME = 'AuthDB';
const DB_VERSION = 1;
const STORE_NAME = 'auth';
const AUTH_KEY = 'Authorization';
const SAVE_DELAY_MS = 100; // 保存后等待时间（毫秒）

let dbPromise = null;

/**
 * 初始化 IndexedDB
 * @returns {Promise<IDBDatabase>} 数据库实例
 */
const initDB = () => {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB 打开失败:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbPromise;
};

/**
 * 从 IndexedDB 读取 Authorization
 * @returns {Promise<string|null>} Authorization 值，如果不存在则返回 null
 */
const readAuthFromDB = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(AUTH_KEY);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => {
        console.error('从 IndexedDB 读取失败:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('读取 Authorization 失败:', error);
    return null;
  }
};

/**
 * 保存 Authorization 到 IndexedDB
 * @param {string|null} token - Authorization 值，null 表示删除
 * @returns {Promise<void>}
 */
const saveAuthToDB = async (token) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    if (token) {
      store.put(token, AUTH_KEY);
    } else {
      store.delete(AUTH_KEY);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        console.error('保存到 IndexedDB 失败:', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('保存 Authorization 失败:', error);
    throw error;
  }
};

/**
 * Sleep 函数，等待指定时间
 * @param {number} ms - 等待时间（毫秒）
 * @returns {Promise<void>}
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * 获取存储的 Authorization
 * @returns {Promise<string|null>} Authorization 值，如果不存在则返回 null
 */
export const getAuthorization = async () => {
  return await readAuthFromDB();
};

/**
 * 设置 Authorization
 * @param {string} token - Authorization 值
 * @returns {Promise<void>}
 */
export const setAuthorization = async (token) => {
  await saveAuthToDB(token);
  // 等待一段时间确保数据已存储到 DB 中
  await sleep(SAVE_DELAY_MS);
};

/**
 * 检查是否已认证
 * @returns {Promise<boolean>} 是否已认证
 */
export const isAuthenticated = async () => {
  const token = await getAuthorization();
  return !!token;
};

/**
 * 清除认证信息
 * @returns {Promise<void>}
 */
export const clearAuthorization = async () => {
  await saveAuthToDB(null);
  // 等待一段时间确保数据已从 DB 中删除
  await sleep(SAVE_DELAY_MS);
};

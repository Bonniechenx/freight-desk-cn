import type { FeeResult } from './freight';

export type AppConfigSnapshot = {
  pricing: unknown;
  surcharges: unknown;
  bindings: unknown;
  workbookQuotes: unknown;
  quoteFolders: unknown;
};

export type BillRecord = {
  id: string;
  fileName: string;
  createdAt: string;
  rowCount: number;
  total: number;
  errorCount: number;
  results: FeeResult[];
  originalGrid?: unknown[][];
  headerRow?: number;
};

const DATABASE_NAME = 'freight-desk-cn';
const DATABASE_VERSION = 1;
const CONFIG_KEY = 'app-config';

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('bills')) {
        const store = database.createObjectStore('bills', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本机数据库'));
  });
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本机数据库操作失败'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('本机数据库写入失败'));
    transaction.onabort = () => reject(transaction.error ?? new Error('本机数据库写入已取消'));
  });
}

export async function loadAppConfig<T>() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction('settings', 'readonly');
    const record = await requestValue<{ key: string; value: T } | undefined>(transaction.objectStore('settings').get(CONFIG_KEY));
    return record?.value ?? null;
  } finally {
    database.close();
  }
}

export async function saveAppConfig(value: AppConfigSnapshot) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction('settings', 'readwrite');
    transaction.objectStore('settings').put({ key: CONFIG_KEY, value, updatedAt: new Date().toISOString() });
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function listBillRecords() {
  const database = await openDatabase();
  try {
    const transaction = database.transaction('bills', 'readonly');
    const records = await requestValue<BillRecord[]>(transaction.objectStore('bills').getAll());
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } finally {
    database.close();
  }
}

export async function saveBillRecord(record: BillRecord) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction('bills', 'readwrite');
    transaction.objectStore('bills').put(record);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function deleteBillRecord(id: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction('bills', 'readwrite');
    transaction.objectStore('bills').delete(id);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

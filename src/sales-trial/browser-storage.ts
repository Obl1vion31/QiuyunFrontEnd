import type { Workspace } from './store';

const databaseName = 'qiuyun-sales-trial';
const tableName = 'accounts';
const readFailure = '本浏览器暂时无法读取销售记录，请检查浏览器存储设置后重试。';
const writeFailure = '本次未保存，输入已保留。请检查浏览器存储空间后重试。';

function openStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(tableName);
    request.onblocked = () => reject(new Error('请关闭其他销售工作台标签页，再重新打开。'));
    request.onerror = () => reject(new Error(readFailure));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export function browserWorkspace(account: string) {
  let connection: Promise<IDBDatabase> | undefined;
  async function access<T>(mode: 'readonly' | 'readwrite', use: (workspace: Workspace) => T) {
    connection ??= openStorage().catch(error => { connection = undefined; throw error; });
    const db = await connection;
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(tableName, mode);
      const table = tx.objectStore(tableName);
      const request = table.get(account);
      let result: T;
      let failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? new Error(mode === 'readonly' ? readFailure : writeFailure));
      request.onsuccess = () => {
        const workspace: Workspace = request.result ?? { rows: [], receipts: new Map() };
        try {
          result = use(workspace);
          if (mode === 'readwrite') table.put(workspace, account);
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
    });
  }
  return {
    read: () => access('readonly', workspace => workspace),
    write: <T>(use: (workspace: Workspace) => T) => access('readwrite', use),
  };
}

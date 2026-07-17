import type { SophiePage } from "./sophie-package";

const DB_NAME = "supersophie-offline";
const STORE_NAME = "pages";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cachePage(page: SophiePage) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(page);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function readCachedPage(id: string) {
  const database = await openDatabase();
  const page = await new Promise<SophiePage | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as SophiePage | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return page;
}

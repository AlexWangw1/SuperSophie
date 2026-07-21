import type { SophiePackageAsset, SophiePage } from "./sophie-package";

const DB_NAME = "supersophie-offline";
const STORE_NAME = "pages";
const PACKAGE_STORE_NAME = "packages";
const PENDING_PAGE_DELETIONS_STORE_NAME = "pending-page-deletions";
export type CachedSophiePackage = { pageId: string; page: SophiePage; assets: SophiePackageAsset[]; cachedAt: string };
export type PendingPageDeletion = { pageId: string; queuedAt: string };

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(PACKAGE_STORE_NAME)) {
        database.createObjectStore(PACKAGE_STORE_NAME, { keyPath: "pageId" });
      }
      if (!database.objectStoreNames.contains(PENDING_PAGE_DELETIONS_STORE_NAME)) {
        database.createObjectStore(PENDING_PAGE_DELETIONS_STORE_NAME, { keyPath: "pageId" });
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

export async function listCachedPages() {
  const database = await openDatabase();
  const pages = await new Promise<SophiePage[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as SophiePage[]).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    request.onerror = () => reject(request.error);
  });
  database.close();
  return pages;
}

export async function cacheSophiePackage(page: SophiePage, assets: SophiePackageAsset[]) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, PACKAGE_STORE_NAME], "readwrite");
    transaction.objectStore(STORE_NAME).put(page);
    transaction.objectStore(PACKAGE_STORE_NAME).put({ pageId: page.id, page, assets, cachedAt: new Date().toISOString() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function readCachedSophiePackage(pageId: string) {
  const database = await openDatabase();
  const result = await new Promise<CachedSophiePackage | undefined>((resolve, reject) => {
    const request = database.transaction(PACKAGE_STORE_NAME).objectStore(PACKAGE_STORE_NAME).get(pageId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

export async function deleteCachedSophiePackage(pageId: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, PACKAGE_STORE_NAME], "readwrite");
    transaction.objectStore(STORE_NAME).delete(pageId);
    transaction.objectStore(PACKAGE_STORE_NAME).delete(pageId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function queuePendingPageDeletion(pageId: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PENDING_PAGE_DELETIONS_STORE_NAME, "readwrite");
    transaction.objectStore(PENDING_PAGE_DELETIONS_STORE_NAME).put({ pageId, queuedAt: new Date().toISOString() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function listPendingPageDeletions() {
  const database = await openDatabase();
  const result = await new Promise<PendingPageDeletion[]>((resolve, reject) => {
    const request = database.transaction(PENDING_PAGE_DELETIONS_STORE_NAME).objectStore(PENDING_PAGE_DELETIONS_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as PendingPageDeletion[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

export async function clearPendingPageDeletion(pageId: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(PENDING_PAGE_DELETIONS_STORE_NAME, "readwrite");
    transaction.objectStore(PENDING_PAGE_DELETIONS_STORE_NAME).delete(pageId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

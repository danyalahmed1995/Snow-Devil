import type { SketchElement } from './sketch-store';

export const SKETCH_DATABASE_NAME = 'snow-devil-sketch-board';
const STORE_NAME = 'board';
const BOARD_KEY = 'primary';

type PersistedBoard = { version: 1; elements: SketchElement[] };

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SKETCH_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSketchBoard(): Promise<SketchElement[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(BOARD_KEY);
      request.onsuccess = () => {
        const value = request.result as PersistedBoard | undefined;
        resolve(value?.version === 1 && Array.isArray(value.elements) ? value.elements : []);
      };
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function saveSketchBoard(elements: SketchElement[]): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ version: 1, elements } satisfies PersistedBoard, BOARD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

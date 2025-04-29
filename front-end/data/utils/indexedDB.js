import { openDB } from "idb";

const dbName = "PermitMonitoringDB";
const storeName = "permits";
const dbVersion = 1;

export const openDatabase = async () => {
  return openDB(dbName, dbVersion, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(storeName)) {
        const store = db.createObjectStore(storeName, {
          keyPath: "id_no", // Use `id_no` as the unique key
        });
        store.createIndex("timestamp", "timestamp");
      }
    },
  });
};

export const storeData = async (data) => {
  const db = await openDatabase();
  const tx = db.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);
  data.forEach((item) => store.put(item));
  await tx.done;
};

export const getCachedData = async () => {
  const db = await openDatabase();
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const allData = await store.getAll();
  await tx.done;
  return allData;
};

export const isCacheExpired = (timestamp) => {
  const cacheExpirationTime = 30 * 60 * 1000; // 30 minutes
  return Date.now() - timestamp > cacheExpirationTime;
};
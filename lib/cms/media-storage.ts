const DB_NAME = 'duindorp-cms-media';
const STORE_NAME = 'blobs';
const DB_VERSION = 1;

function openMediaDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Deze browser ondersteunt geen lokale foto-opslag.')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('De foto-opslag kon niet worden geopend.'));
    request.onblocked = () => reject(new Error('Sluit andere beheertabbladen en probeer opnieuw.'));
  });
}

export async function putMediaBlob(key: string, blob: Blob): Promise<void> {
  const db = await openMediaDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Foto opslaan is niet gelukt. Mogelijk is de browseropslag vol.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Foto opslaan is onderbroken.')); };
  });
}

export async function getMediaBlob(key: string): Promise<Blob | undefined> {
  const db = await openMediaDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : undefined);
    request.onerror = () => reject(request.error || new Error('Foto laden is niet gelukt.'));
    tx.oncomplete = () => db.close();
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Foto laden is onderbroken.')); };
  });
}

export async function deleteMediaBlob(key: string): Promise<void> {
  const db = await openMediaDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Foto verwijderen is niet gelukt.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Foto verwijderen is onderbroken.')); };
  });
}

export async function validateImageFile(file: File): Promise<string | null> {
  if (file.size > 8 * 1024 * 1024) return 'maximaal 8 MB per foto';
  if (!file.size) return 'dit bestand is leeg';
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(file.type)) return 'gebruik JPG, PNG, WebP, AVIF of GIF';
  const bytes = new Uint8Array(await file.slice(0, 48).arrayBuffer());
  const word = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  const valid = (file.type === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || (file.type === 'image/png' && bytes[0] === 0x89 && word(1, 3) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a)
    || (file.type === 'image/gif' && ['GIF87a', 'GIF89a'].includes(word(0, 6)))
    || (file.type === 'image/webp' && word(0, 4) === 'RIFF' && word(8, 4) === 'WEBP')
    || (file.type === 'image/avif' && word(4, 4) === 'ftyp' && /avif|avis/.test(word(8, 40)));
  if (!valid) return 'de inhoud is geen ondersteund afbeeldingsbestand';
  return new Promise(resolve => {
    const src = URL.createObjectURL(file);
    const img = new Image();
    const finish = (error: string | null) => { URL.revokeObjectURL(src); resolve(error); };
    img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0 ? null : 'de afbeelding is beschadigd');
    img.onerror = () => finish('deze afbeelding kan niet worden geopend');
    img.src = src;
  });
}

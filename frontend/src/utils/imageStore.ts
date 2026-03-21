// Simple IndexedDB wrapper for storing large blobs (background images)
// Keeps binary data out of localStorage/chrome.storage to avoid performance issues

const DB_NAME = 'catheadtab-assets';
const STORE_NAME = 'images';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveImageBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadImageBlob(key: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => {
      const blob = req.result as Blob | undefined;
      if (blob) {
        resolve(URL.createObjectURL(blob));
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteImageBlob(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Raw Blob access (for cloud upload) ---

export async function getRawBlob(key: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => {
      const blob = req.result as Blob | undefined;
      resolve(blob || null);
    };
    req.onerror = () => reject(req.error);
  });
}

// --- Image Compression ---

// Maximum dimensions for the compressed image
const MAX_WIDTH = 2560;
const MAX_HEIGHT = 1440;
// Target file size after compression (2 MB)
const TARGET_SIZE = 2 * 1024 * 1024;

/**
 * Compress an image Blob to WebP format with size constraints.
 * - Resizes to max 2560×1440 (maintaining aspect ratio)
 * - Compresses iteratively to stay under 2 MB
 * - Returns a WebP Blob
 */
export async function compressImageToWebP(blob: Blob): Promise<Blob> {
  const img = await createImageFromBlob(blob);
  const { width, height } = calculateDimensions(img.width, img.height, MAX_WIDTH, MAX_HEIGHT);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);

  // Try progressive quality reduction to hit target size
  let quality = 0.85;
  let result = await canvasToWebP(canvas, quality);

  while (result.size > TARGET_SIZE && quality > 0.3) {
    quality -= 0.1;
    result = await canvasToWebP(canvas, quality);
  }

  // If still too large, scale down further
  if (result.size > TARGET_SIZE) {
    const scale = Math.sqrt(TARGET_SIZE / result.size) * 0.9;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    result = await canvasToWebP(canvas, 0.7);
  }

  return result;
}

function createImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

function calculateDimensions(
  srcW: number, srcH: number, maxW: number, maxH: number
): { width: number; height: number } {
  let width = srcW;
  let height = srcH;
  if (width > maxW) {
    height = Math.round(height * (maxW / width));
    width = maxW;
  }
  if (height > maxH) {
    width = Math.round(width * (maxH / height));
    height = maxH;
  }
  return { width, height };
}

function canvasToWebP(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/webp',
      quality
    );
  });
}

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

// --- Directory Handle persistence (for remembering last-used local folder) ---

const DIR_HANDLE_KEY = 'local-wallpaper-dir';

/**
 * saveDirHandle persists a FileSystemDirectoryHandle into IndexedDB
 * so the user's last-selected local wallpaper folder can be restored.
 */
export async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, DIR_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * loadDirHandle retrieves the previously saved FileSystemDirectoryHandle.
 * Returns null if no handle was saved or if IndexedDB read fails.
 */
export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(DIR_HANDLE_KEY);
    req.onsuccess = () => {
      const handle = req.result as FileSystemDirectoryHandle | undefined;
      resolve(handle || null);
    };
    req.onerror = () => reject(req.error);
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

// --- Thumbnail Generation ---

// Thumbnail max dimensions (big enough to look sharp on fullscreen 2x/3x screens)
const THUMB_MAX_W = 480;
const THUMB_MAX_H = 360;

/**
 * generateThumbnail creates a small WebP thumbnail from a File/Blob.
 * Uses createImageBitmap (no DOM needed, works off-main-thread friendly)
 * + OffscreenCanvas for fast GPU-accelerated resizing.
 * Returns a tiny Blob (typically 5-20 KB) suitable for grid display.
 */
export async function generateThumbnail(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = calculateDimensions(
    bitmap.width, bitmap.height, THUMB_MAX_W, THUMB_MAX_H
  );

  // Prefer OffscreenCanvas (no DOM, faster) with fallback to regular canvas
  if (typeof OffscreenCanvas !== 'undefined') {
    const oc = new OffscreenCanvas(width, height);
    const ctx = oc.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return oc.convertToBlob({ type: 'image/webp', quality: 0.6 });
  }

  // Fallback for older browsers
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvasToWebP(canvas, 0.72);
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

// --- Avatar Compression ---

// Avatar max dimensions (square, optimised for profile display)
const AVATAR_MAX_SIZE = 512;
// Avatar max file size after compression (2 MB — same as backend limit)
const AVATAR_MAX_FILE_SIZE = 2 * 1024 * 1024;

/**
 * compressAvatarToWebP resizes and compresses an image for use as a user
 * avatar. The output is a square-cropped (center) WebP blob that fits within
 * 512×512 px and 2 MB.
 */
export async function compressAvatarToWebP(blob: Blob): Promise<Blob> {
  const img = await createImageFromBlob(blob);

  // Calculate a centered square crop from the original image
  const srcSize = Math.min(img.width, img.height);
  const sx = (img.width - srcSize) / 2;
  const sy = (img.height - srcSize) / 2;

  const dim = Math.min(srcSize, AVATAR_MAX_SIZE);

  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, dim, dim);

  // Progressive quality reduction to stay under file size limit
  let quality = 0.88;
  let result = await canvasToWebP(canvas, quality);

  while (result.size > AVATAR_MAX_FILE_SIZE && quality > 0.3) {
    quality -= 0.1;
    result = await canvasToWebP(canvas, quality);
  }

  // Last resort: reduce dimensions further
  if (result.size > AVATAR_MAX_FILE_SIZE) {
    const scale = Math.sqrt(AVATAR_MAX_FILE_SIZE / result.size) * 0.9;
    canvas.width = Math.round(dim * scale);
    canvas.height = Math.round(dim * scale);
    ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, canvas.width, canvas.height);
    result = await canvasToWebP(canvas, 0.7);
  }

  return result;
}

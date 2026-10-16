import type { PublicPath } from 'wxt/browser';

const iconData = new Map<string, Promise<Record<number, ImageData>>>();

async function loadIcon(path: PublicPath): Promise<Record<number, ImageData>> {
  const response = await fetch(browser.runtime.getURL(path));
  if (!response.ok) throw new Error(`Could not load action icon: ${path}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const images: Record<number, ImageData> = {};
    // Chromium discards oversized action bitmaps. Supply actual toolbar sizes
    // rather than passing the original 237/238px assets to setIcon.
    for (const size of [16, 32]) {
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not create action icon canvas');
      context.drawImage(bitmap, 0, 0, size, size);
      images[size] = context.getImageData(0, 0, size, size);
    }
    return images;
  } finally { bitmap.close(); }
}

export async function setActionIcon(tabId: number, path: PublicPath): Promise<void> {
  let pending = iconData.get(path);
  if (!pending) {
    pending = loadIcon(path).catch(error => {
      iconData.delete(path); // A transient load failure must not poison the cache.
      throw error;
    });
    iconData.set(path, pending);
  }
  const details = { tabId, imageData: await pending };
  const action = browser.action ?? browser.browserAction;
  if (import.meta.env.FIREFOX) {
    await action.setIcon(details);
  } else {
    // Chromium's custom setIcon binding can return undefined even though the
    // types advertise a Promise. Its callback owns runtime.lastError.
    await new Promise<void>((resolve, reject) => {
      action.setIcon(details, () => {
        const error = browser.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }
}

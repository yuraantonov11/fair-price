import type { ContentScriptAppendMode } from 'wxt/utils/content-script-ui/types';

export type MountInsertMethod = ContentScriptAppendMode;

interface PlaceMountOptions {
  mountPoint: HTMLElement;
  anchor: Element;
  insertMethod: MountInsertMethod;
}

export function isMountMissing(
  mountPoint: HTMLElement | null,
  contains: (node: Node) => boolean = (node) => document.contains(node),
): boolean {
  return !mountPoint || !contains(mountPoint);
}

export function isMountOutOfPlace(
  mountPoint: HTMLElement | null,
  anchor: Element,
  insertMethod: MountInsertMethod,
  contains: (node: Node) => boolean = (node) => document.contains(node),
): boolean {
  if (!mountPoint || !contains(mountPoint)) return true;

  if (insertMethod === 'after') {
    return mountPoint.parentNode !== anchor.parentNode || mountPoint.previousSibling !== anchor;
  }

  return mountPoint.parentNode !== anchor;
}

export function placeMountNearAnchor({ mountPoint, anchor, insertMethod }: PlaceMountOptions): void {
  if (insertMethod === 'after') {
    anchor.parentNode?.insertBefore(mountPoint, anchor.nextSibling);
    return;
  }

  anchor.appendChild(mountPoint);
}




import { describe, expect, it, vi } from 'vitest';
import {
  isMountMissing,
  isMountOutOfPlace,
  placeMountNearAnchor,
} from '@/core/spaReinjectHelper';

describe('spaReinjectHelper', () => {
  it('treats null or detached mount as missing', () => {
    expect(isMountMissing(null, () => false)).toBe(true);
    expect(isMountMissing({} as HTMLElement, () => false)).toBe(true);
    expect(isMountMissing({} as HTMLElement, () => true)).toBe(false);
  });

  it('detects out-of-place mount for after insertion', () => {
    const parent = {} as Node;
    const anchor = { parentNode: parent } as Element;

    const alignedMount = { parentNode: parent, previousSibling: anchor } as unknown as HTMLElement;
    const displacedMount = { parentNode: parent, previousSibling: null } as unknown as HTMLElement;

    expect(isMountOutOfPlace(alignedMount, anchor, 'after', () => true)).toBe(false);
    expect(isMountOutOfPlace(displacedMount, anchor, 'after', () => true)).toBe(true);
  });

  it('places mount after anchor via parent.insertBefore', () => {
    const mount = { parentNode: null, previousSibling: null } as any;
    const parent = {
      insertBefore: vi.fn((node: any) => {
        node.parentNode = parent;
        node.previousSibling = anchor;
      }),
    } as any;
    const anchor = { parentNode: parent, nextSibling: {} } as any;

    placeMountNearAnchor({ mountPoint: mount, anchor, insertMethod: 'after' });

    expect(parent.insertBefore).toHaveBeenCalledOnce();
    expect(mount.parentNode).toBe(parent);
    expect(mount.previousSibling).toBe(anchor);
  });

  it('places mount into anchor for append mode', () => {
    const mount = { parentNode: null } as any;
    const anchor = {
      appendChild: vi.fn((node: any) => {
        node.parentNode = anchor;
      }),
      parentNode: null,
    } as any;

    placeMountNearAnchor({ mountPoint: mount, anchor, insertMethod: 'last' });

    expect(anchor.appendChild).toHaveBeenCalledOnce();
    expect(mount.parentNode).toBe(anchor);
  });
});




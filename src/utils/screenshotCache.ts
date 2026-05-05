/**
 * LRU cache for preview screenshot blob URLs.
 *
 * Entries are keyed by `${url}:${blockPopups}` so a change in the blockPopups
 * setting correctly invalidates cached images that may have banners visible.
 *
 * When entries are evicted or deleted, their blob URLs are revoked immediately
 * to free the underlying memory.
 */
export class ScreenshotCache {
  private map = new Map<string, string>(); // key → blobUrl
  private readonly maxSize: number;

  constructor(maxSize = 20) {
    this.maxSize = maxSize;
  }

  static key(url: string, blockPopups: boolean): string {
    return `${url}:${blockPopups}`;
  }

  get(url: string, blockPopups: boolean): string | undefined {
    const k = ScreenshotCache.key(url, blockPopups);
    const val = this.map.get(k);
    if (val !== undefined) {
      // Move to end to mark as most-recently used
      this.map.delete(k);
      this.map.set(k, val);
    }
    return val;
  }

  set(url: string, blockPopups: boolean, blobUrl: string): void {
    const k = ScreenshotCache.key(url, blockPopups);
    if (this.map.has(k)) {
      URL.revokeObjectURL(this.map.get(k)!);
      this.map.delete(k);
    } else if (this.map.size >= this.maxSize) {
      // Evict the oldest (first) entry
      const oldestKey = this.map.keys().next().value as string;
      URL.revokeObjectURL(this.map.get(oldestKey)!);
      this.map.delete(oldestKey);
    }
    this.map.set(k, blobUrl);
  }

  delete(url: string, blockPopups: boolean): void {
    const k = ScreenshotCache.key(url, blockPopups);
    const val = this.map.get(k);
    if (val) URL.revokeObjectURL(val);
    this.map.delete(k);
  }

  /** Read the blob URL directly (no LRU update) — for use in ScreenshotModal. */
  peek(url: string, blockPopups: boolean): string | undefined {
    return this.map.get(ScreenshotCache.key(url, blockPopups));
  }

  get size(): number {
    return this.map.size;
  }
}

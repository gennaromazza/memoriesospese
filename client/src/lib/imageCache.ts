// Sistema di cache intelligente per le immagini con eviction LRU
class ImageCache {
  private cache = new Map<string, HTMLImageElement>();
  private loadingPromises = new Map<string, Promise<HTMLImageElement>>();
  private readonly maxEntries = 250;

  private touch(url: string, img: HTMLImageElement) {
    if (this.cache.has(url)) this.cache.delete(url);
    this.cache.set(url, img);
    this.evictIfNeeded();
  }

  private evictIfNeeded() {
    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
    }
  }

  preloadImage(url: string): Promise<HTMLImageElement> {
    if (this.cache.has(url)) {
      const cached = this.cache.get(url)!;
      this.touch(url, cached);
      return Promise.resolve(cached);
    }
    if (this.loadingPromises.has(url)) return this.loadingPromises.get(url)!;

    const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.touch(url, img);
        this.loadingPromises.delete(url);
        resolve(img);
      };
      img.onerror = () => {
        this.loadingPromises.delete(url);
        reject(new Error(`Failed to load image: ${url}`));
      };
      img.src = url;
    });

    this.loadingPromises.set(url, loadPromise);
    return loadPromise;
  }

  preloadImages(urls: string[]): Promise<HTMLImageElement[]> {
    return Promise.all(urls.map(url => this.preloadImage(url)));
  }

  /**
   * Precarica tutte le immagini in batch controllati con callback di progresso.
   * @param urls Lista di URL da precaricare
   * @param onProgress (loaded, total) chiamato dopo ogni batch
   * @param signal AbortSignal per annullare
   * @param concurrency Numero di immagini caricate in parallelo (default 8)
   */
  async preloadAllWithProgress(
    urls: string[],
    onProgress?: (loaded: number, total: number) => void,
    signal?: AbortSignal,
    concurrency = 8
  ): Promise<{ loaded: number; skipped: number }> {
    const total = urls.length;
    let loaded = 0;
    let skipped = 0;

    for (let i = 0; i < urls.length; i += concurrency) {
      if (signal?.aborted) break;

      const batch = urls.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map(url => {
          if (signal?.aborted) return Promise.reject('aborted');
          return this.preloadImage(url);
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') loaded++;
        else skipped++;
      }

      onProgress?.(loaded + skipped, total);
    }

    return { loaded, skipped };
  }

  isImageCached(url: string): boolean {
    return this.cache.has(url);
  }

  getCachedImage(url: string): HTMLImageElement | null {
    const img = this.cache.get(url);
    if (img) this.touch(url, img);
    return img || null;
  }

  clearCache(): void {
    this.cache.clear();
    this.loadingPromises.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  /** Stima MB occupati (approssimativa: ~300KB per immagine in cache) */
  estimatedMB(): number {
    return Math.round((this.cache.size * 300) / 1024 * 10) / 10;
  }
}

export const imageCache = new ImageCache();

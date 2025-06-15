// Sistema di cache intelligente per le immagini
class ImageCache {
  private cache = new Map<string, HTMLImageElement>();
  private loadingPromises = new Map<string, Promise<HTMLImageElement>>();
  private maxCacheSize = 100; // Massimo 100 immagini in cache

  preloadImage(url: string): Promise<HTMLImageElement> {
    // Se l'immagine è già in cache, restituiscila
    if (this.cache.has(url)) {
      return Promise.resolve(this.cache.get(url)!);
    }

    // Se è già in caricamento, restituisci la promise esistente
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url)!;
    }

    // Crea una nuova promise per il caricamento
    const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        // Gestisci la dimensione della cache
        if (this.cache.size >= this.maxCacheSize) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey) {
            this.cache.delete(firstKey);
          }
        }
        
        this.cache.set(url, img);
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

  isImageCached(url: string): boolean {
    return this.cache.has(url);
  }

  getCachedImage(url: string): HTMLImageElement | null {
    return this.cache.get(url) || null;
  }

  clearCache(): void {
    this.cache.clear();
    this.loadingPromises.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

export const imageCache = new ImageCache();
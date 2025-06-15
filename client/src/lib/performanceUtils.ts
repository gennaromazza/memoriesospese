// Utilities per ottimizzazione performance

// Debounce function per ridurre chiamate eccessive
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function per limitare frequenza di esecuzione
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Batch processing per elaborazioni multiple
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 5,
  delay: number = 100
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => processor(item))
    );
    
    results.push(...batchResults);
    
    // Piccola pausa tra batch per non sovraccaricare
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return results;
}

// Memory cleanup utility
export function cleanupUnusedResources() {
  // Force garbage collection se disponibile
  if (window.gc) {
    window.gc();
  }
  
  // Pulisci cache obsolete
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        if (name.includes('old') || name.includes('temp')) {
          caches.delete(name);
        }
      });
    });
  }
}

// Intersection Observer ottimizzato per lazy loading
export function createOptimizedObserver(
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit
): IntersectionObserver {
  const defaultOptions: IntersectionObserverInit = {
    threshold: 0.1,
    rootMargin: "100px",
    ...options
  };
  
  return new IntersectionObserver(callback, defaultOptions);
}

// Performance monitoring
export class PerformanceMonitor {
  private static measurements = new Map<string, number>();
  
  static startMeasure(name: string): void {
    this.measurements.set(name, performance.now());
  }
  
  static endMeasure(name: string): number {
    const startTime = this.measurements.get(name);
    if (!startTime) return 0;
    
    const duration = performance.now() - startTime;
    this.measurements.delete(name);
    
    return duration;
  }
  
  static logMeasure(name: string): void {
    const duration = this.endMeasure(name);
    if (duration > 0) {
      console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
    }
  }
}
import { useEffect } from 'react';

export function usePrefetchPopularPages() {
  useEffect(() => {
    const prefetchRoutes = () => {
      if ('connection' in navigator) {
        const conn = (navigator as any).connection;
        if (conn?.saveData || conn?.effectiveType === '2g') {
          return;
        }
      }

      const routesToPrefetch = [
        '/portfolio',
        '/blog',
        '/prenota',
        '/storie'
      ];

      routesToPrefetch.forEach(route => {
        const existingLink = document.querySelector(`link[href="${route}"]`);
        if (existingLink) return;
        
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = route;
        link.as = 'document';
        document.head.appendChild(link);
      });
    };

    const timeoutId = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(prefetchRoutes, { timeout: 5000 });
      } else {
        prefetchRoutes();
      }
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, []);
}

export function useImagePreload(urls: string[], priority: 'high' | 'low' = 'low') {
  useEffect(() => {
    if (!urls.length) return;

    const preloadImages = () => {
      urls.forEach((url, index) => {
        if (priority === 'high' && index === 0) {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'image';
          link.href = url;
          document.head.appendChild(link);
        } else {
          const img = new Image();
          img.src = url;
        }
      });
    };

    if (priority === 'high') {
      preloadImages();
    } else if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(preloadImages);
    } else {
      setTimeout(preloadImages, 1000);
    }
  }, [urls, priority]);
}

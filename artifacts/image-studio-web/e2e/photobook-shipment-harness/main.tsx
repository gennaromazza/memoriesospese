import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import '../../src/index.css';
import PhotobooksManager from '../../src/components/photobook/PhotobooksManager';
import { queryClient } from './queryClient';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <main className="p-4"><PhotobooksManager loadGalleries={async () => []} loadJobs={async () => []}/></main>
  </QueryClientProvider>,
);

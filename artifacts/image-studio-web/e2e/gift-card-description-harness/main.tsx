import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../../src/index.css';
import GiftCardTypesPanel from '../../src/components/gift-cards/admin/GiftCardTypesPanel';
import { resetGiftCardDescriptionState } from './stubs/state';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
});

resetGiftCardDescriptionState();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <main className="mx-auto max-w-7xl p-6">
      <h1 className="mb-5 text-2xl font-semibold">Test descrizione gift card</h1>
      <GiftCardTypesPanel />
    </main>
  </QueryClientProvider>,
);

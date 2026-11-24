import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MockupPayload } from '@shared/mockup-types';
import MockupAdminFlow, { type MockupPathChoice } from '@/components/photobook/MockupAdminFlow';

const photobookId = 'e2e-photobook-share';
const version = 1;
const stateKey = ['photobook-mockup-flow', photobookId, version];
const confirmedMockup = {
  offer: {
    revision: 1,
    mode: 'fixed',
    options: [{ id: 'e2e-album', labId: 'e2e-studio', name: 'Album di prova', labName: 'Studio di prova' }],
  },
  saved: {
    revision: 3,
    status: 'confirmed',
    updatedAt: '2026-10-20T10:00:00.000Z',
    updatedBy: 'studio',
    configuration: { materialId: 'e2e-material' },
    option: {
      name: 'Album di prova',
      labName: 'Studio di prova',
      materials: [{ id: 'e2e-material', label: 'Tessuto di prova' }],
    },
  },
} as unknown as MockupPayload;

/** Stato locale pre-caricato per verificare la condivisione senza autenticazione o scritture API. */
export default function PhotobookMockupSharingE2EHarness() {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false } },
    });
    client.setQueryData(stateKey, confirmedMockup);
    return client;
  });
  const [mockupPath, setMockupPath] = useState<MockupPathChoice>('client');

  return (
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto max-w-3xl p-4">
        <MockupAdminFlow
          photobookId={photobookId}
          version={version}
          currentVersion={version}
          pagesApproved={false}
          mockupPath={mockupPath}
          pathBusy={false}
          onPathChange={setMockupPath}
          emailStatus="nessuna email inviata"
          readOnly={false}
          clientLink={`${window.location.origin}/fotolibro/e2e-share-token`}
        />
      </main>
    </QueryClientProvider>
  );
}

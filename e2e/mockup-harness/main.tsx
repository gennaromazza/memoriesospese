import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PhotobookMockup from '../../client/src/components/photobook/PhotobookMockup';
import LabMockupCatalog from '../../client/src/components/labs/LabMockupCatalog';
import MockupTrack from '../../client/src/components/jobs/operativo/MockupTrack';
import '../../client/src/index.css';
const params = new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><main className="max-w-6xl mx-auto p-4">{params.has('catalog') ? <LabMockupCatalog labId="lab" /> : params.has('job') ? <MockupTrack jobId="job" /> : <PhotobookMockup photobookId="book" version={1} token={params.has('admin') ? undefined : 'mockup-test-token'} readOnly={params.has('readonly')} />}</main></QueryClientProvider>);

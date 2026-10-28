import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Route, Router, Switch } from 'wouter';
import '../../src/index.css';
import PhotobooksManager from '../../src/components/photobook/PhotobooksManager';
import PhotobookEditorPage from '../../src/pages/admin/PhotobookEditorPage';
import { queryClient } from './queryClient';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <Router>
      <Switch>
        <Route path="/" component={() => <main className="p-4"><PhotobooksManager loadGalleries={async () => []} loadJobs={async () => []}/></main>} />
        <Route path="/admin/dashboard" component={() => <main className="p-4"><PhotobooksManager loadGalleries={async () => []} loadJobs={async () => []}/></main>} />
        <Route path="/admin/photobooks/:id" component={PhotobookEditorPage} />
        <Route>Pagina test non trovata</Route>
      </Switch>
    </Router>
  </QueryClientProvider>,
);

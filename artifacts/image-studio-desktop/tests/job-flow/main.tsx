import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Router, Switch, useLocation } from 'wouter';
import { fixture } from './api-fixture';
import './fixture.css';

// Fail closed before loading any production component. Vite uses WebSocket HMR;
// app HTTP traffic, XHR, beacons and external navigation must not leave here.
window.fetch = async (input) => {
  fixture.blockedNetwork.push(String(input));
  throw new Error(`Fixture blocked network: ${String(input)}`);
};
XMLHttpRequest.prototype.open = function () {
  fixture.blockedNetwork.push('XMLHttpRequest');
  throw new Error('Fixture blocked XMLHttpRequest');
};
navigator.sendBeacon = () => { fixture.blockedNetwork.push('sendBeacon'); return false; };
window.open = () => { fixture.blockedNetwork.push('window.open'); return null; };
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
});
Object.assign(window, { jobFlowFixture: fixture });
const [{ default: NewGallery }, { default: Workspace }] = await Promise.all([
  import('../../src/pages/galleries/new'),
  import('../../src/pages/galleries/workspace'),
]);

function Harness() {
  const [, navigate] = useLocation();
  const [resource, setResource] = useState<'jobs' | 'clients' | 'job-types' | 'create' | 'save'>('jobs');
  const [mode, setMode] = useState<'ok' | 'error' | 'slow'>('ok');
  const apply = () => {
    fixture.setMode(resource, mode);
    if (['jobs', 'clients', 'job-types'].includes(resource)) {
      void queryClient.resetQueries({ queryKey: [resource] });
    }
  };
  return <div className="flex h-screen flex-col">
    <aside className="flex flex-wrap items-center gap-3 border-b bg-muted p-3" aria-label="Controlli fixture">
      <strong>Ambiente isolato — nessun dato reale</strong>
      <button onClick={() => navigate('/galleries/new')}>Nuova galleria fixture</button>
      <select aria-label="Risorsa fixture" value={resource} onChange={e => setResource(e.target.value as typeof resource)}>
        {['jobs', 'clients', 'job-types', 'create', 'save'].map(value => <option key={value}>{value}</option>)}
      </select>
      <select aria-label="Esito fixture" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>
        {['ok', 'error', 'slow'].map(value => <option key={value}>{value}</option>)}
      </select>
      <button onClick={apply}>Applica scenario</button>
      <button onClick={() => { sessionStorage.clear(); location.href = '/'; }}>Reset fixture</button>
    </aside>
    <main className="min-h-0 flex-1 overflow-auto">
      <Switch>
        <Route path="/galleries/new"><NewGallery /></Route>
        <Route path="/galleries/:id">{params => <Workspace id={params.id} />}</Route>
        <Route><NewGallery /></Route>
      </Switch>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><Router><Harness /></Router></QueryClientProvider>,
);
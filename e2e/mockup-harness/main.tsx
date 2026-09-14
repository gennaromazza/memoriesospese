import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../client/src/lib/queryClient';
import { installMockupWizard } from '../../client/src/components/photobook/mockup-wizard-layout';
import PhotobookMockup from '../../client/src/components/photobook/PhotobookMockup';
import LabMockupCatalog from '../../client/src/components/labs/LabMockupCatalog';
import MockupTrack from '../../client/src/components/jobs/operativo/MockupTrack';
import PhotobookViewPage from '../../client/src/pages/PhotobookViewPage';
import PhotobookEditorPage from '../../client/src/pages/admin/PhotobookEditorPage';
import { Route } from 'wouter';
import '../../client/src/index.css';
const params = new URLSearchParams(location.search);
queryClient.setDefaultOptions({ queries: { retry: false } });

const LAYOUT_LIFECYCLE_FIXTURE = `<!doctype html>
  <html><head></head><body>
    <main>
      <div class="workspace"><div class="stage"></div></div>
      <aside><div class="panel-content">
        <section id="detailPanel">
          <h2>Dettagli</h2>
          <section id="coverOptions">
            <label for="coverLayout">Layout</label>
            <select id="coverLayout"><option value="full">Intero</option></select>
          </section>
        </section>
        <section id="fabricPanel"><h2>Rivestimento</h2></section>
        <section id="summaryPanel"><h2>Riepilogo</h2></section>
      </div></aside>
    </main>
  </body></html>`;

type LayoutLifecycleSnapshot = {
  wizard: string | null;
  wizardLayout: string | null;
  wizardMobile: string | null;
  styleCount: number;
  baseStyleCount: number;
  mobileStyleCount: number;
};

function layoutLifecycleSnapshot(doc: Document): LayoutLifecycleSnapshot {
  const styles = Array.from(doc.querySelectorAll<HTMLStyleElement>('style[data-mockup-wizard-style="true"]'));
  return {
    wizard: doc.body.dataset.wizard || null,
    wizardLayout: doc.body.dataset.wizardLayout || null,
    wizardMobile: doc.body.dataset.wizardMobile || null,
    styleCount: styles.length,
    baseStyleCount: styles.filter(style => style.dataset.mockupWizardStyleKind === 'base').length,
    mobileStyleCount: styles.filter(style => style.dataset.mockupWizardStyleKind === 'mobile').length,
  };
}

function LayoutLifecycleRenderer({
  revision,
  mobile,
  onDisposeReady,
}: {
  revision: number;
  mobile: boolean;
  onDisposeReady: (dispose: () => void) => void;
}) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const layout = React.useRef<ReturnType<typeof installMockupWizard> | null>(null);
  const layoutDocument = React.useRef<Document | null>(null);

  const dispose = React.useCallback(() => {
    if (!layout.current || !layoutDocument.current) return;
    layout.current.dispose();
    const snapshots = ((window as typeof window & {
      __mockupLayoutLifecycle?: { disposed: LayoutLifecycleSnapshot[] };
    }).__mockupLayoutLifecycle ||= { disposed: [] }).disposed;
    snapshots.push(layoutLifecycleSnapshot(layoutDocument.current));
    layout.current.dispose();
    snapshots.push(layoutLifecycleSnapshot(layoutDocument.current));
  }, []);

  React.useEffect(() => () => dispose(), [dispose]);

  return <iframe
    key={revision}
    ref={frame}
    data-testid="layout-lifecycle-frame"
    title={`Renderer di test ${revision}`}
    srcDoc={LAYOUT_LIFECYCLE_FIXTURE}
    onLoad={() => {
      const doc = frame.current?.contentDocument;
      if (!doc) throw new Error('Renderer di test non disponibile');
      const nextLayout = installMockupWizard(doc, mobile);
      layout.current = nextLayout;
      layoutDocument.current = doc;
      onDisposeReady(() => dispose);
    }}
  />;
}

function LayoutLifecycleHarness() {
  const [revision, setRevision] = React.useState(0);
  const [dispose, setDispose] = React.useState<(() => void) | null>(null);
  const mobile = params.has('mobile');
  React.useEffect(() => {
    (window as typeof window & {
      __mockupLayoutLifecycle?: { disposed: LayoutLifecycleSnapshot[] };
    }).__mockupLayoutLifecycle = { disposed: [] };
    return () => {
      delete (window as typeof window & {
        __mockupLayoutLifecycle?: { disposed: LayoutLifecycleSnapshot[] };
      }).__mockupLayoutLifecycle;
    };
  }, []);
  return <main data-testid="layout-lifecycle-harness">
    <button type="button" onClick={() => { setDispose(null); setRevision(value => value + 1); }}>
      Sostituisci renderer
    </button>
    <button type="button" onClick={() => dispose?.()}>
      Rimuovi layout
    </button>
    <output data-testid="layout-lifecycle-revision" data-revision={revision}>{revision}</output>
    <LayoutLifecycleRenderer key={revision} revision={revision} mobile={mobile} onDisposeReady={setDispose} />
  </main>;
}

const app = location.pathname === '/history-away'
  ? <main data-testid="history-away" className="max-w-6xl mx-auto p-4"><h1>Pagina di prova</h1><p>Sei fuori dal configuratore.</p></main>
  : params.has('layout-lifecycle')
    ? <LayoutLifecycleHarness />
  : location.pathname.startsWith('/fotolibro/')
    ? <Route path="/fotolibro/:token"><PhotobookViewPage /></Route>
    : location.pathname.startsWith('/admin/photobooks/')
      ? <Route path="/admin/photobooks/:id"><PhotobookEditorPage /></Route>
      : <main className="max-w-6xl mx-auto p-4">{params.has('catalog') ? <LabMockupCatalog labId="lab" /> : params.has('job') ? <MockupTrack jobId="job" /> : <PhotobookMockup photobookId="book" version={1} token={params.has('admin') ? undefined : 'mockup-test-token'} readOnly={params.has('readonly')} />}</main>;
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}>{app}</QueryClientProvider>);

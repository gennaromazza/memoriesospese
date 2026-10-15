import MockupOfferEditor from '@/components/photobook/MockupOfferEditor';

declare global { interface Window { __mockupOfferPublished?: unknown } }

/** Solo sviluppo/e2e: il form di assegnazione dei modelli senza passare dal login admin. */
export default function MockupOfferE2EHarness() {
  return (
    <main className="mx-auto max-w-3xl p-4">
      <MockupOfferEditor
        offer={null}
        disabled={false}
        alwaysOpen
        uploadGraphic={async () => '10000000-0000-4000-8000-000000000009'}
        publish={async (mode, selections) => { window.__mockupOfferPublished = { mode, selections }; return true; }}
      />
    </main>
  );
}

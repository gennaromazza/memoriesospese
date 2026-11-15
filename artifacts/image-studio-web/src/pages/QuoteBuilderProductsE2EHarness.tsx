import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import QuoteBuilder from "@/components/quotes/QuoteBuilder";

const jobId = "e2e-quote-products-job";
const quoteId = "e2e-quote-products";

const fixtureQuote = {
  id: quoteId,
  jobId,
  clienteId: "e2e-quote-products-client",
  type: "variabile",
  products: [
    {
      customProductId: "custom-quote-product-a",
      nome: "Album aggiuntivo",
      descrizione: "Versione piccola",
      prezzo: 120,
      selectable: true,
      sezione: "Album",
      numeroFoto: 0,
      categoria: "",
      immagini: [],
      isOmaggio: false,
    },
    {
      customProductId: "custom-quote-product-b",
      nome: "Album aggiuntivo",
      descrizione: "Versione grande",
      prezzo: 240,
      selectable: false,
      sezione: "Stampe",
      numeroFoto: 0,
      categoria: "",
      immagini: [],
      isOmaggio: false,
    },
  ],
  theme: { primaryColor: "#6b7f6b", secondaryColor: "#d6dfd6" },
  paymentScheduleConfig: {
    autoGenerate: false,
    numberOfPayments: 2,
    accontoType: "percentage",
    accontoPercentage: 30,
    accontoAmount: 0,
    useEventDateReference: true,
    accontoRelativeDays: -30,
    rateIntervalDays: 30,
  },
  discountValue: 0,
  noteInterne: "",
};

export default function QuoteBuilderProductsE2EHarness() {
  const [open, setOpen] = useState(true);
  const loadSavedQuote = new URLSearchParams(window.location.search).get("loadSavedQuote") === "1";
  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
          queryFn: async () => [],
        },
      },
    });

    if (!loadSavedQuote) {
      client.setQueryData(["quotes", quoteId], fixtureQuote);
    }
    client.setQueryData(["jobs", jobId], {
      id: jobId,
      nomeEvento: "Lavoro preventivo di prova",
      quoteIds: [quoteId],
      galleryIds: [],
      orderIds: [],
      eventDate: new Date("2027-06-15T12:00:00.000Z"),
    });
    client.setQueryData(["quote-templates"], []);
    client.setQueryData(["products"], []);
    client.setQueryData(["contract-clause-templates"], []);
    client.setQueryData(["quotes", "job", jobId], []);

    return client;
  }, [loadSavedQuote]);

  return (
    <QueryClientProvider client={queryClient}>
      <main className="min-h-screen bg-background p-4">
        <QuoteBuilder
          jobId={jobId}
          clienteId="e2e-quote-products-client"
          jobType={{
            id: "e2e-matrimonio",
            slug: "matrimonio",
            nome: "Matrimonio",
            colore: "#6b7f6b",
          } as any}
          jobTypeSlug="matrimonio"
          open={open}
          onClose={() => setOpen(false)}
          editQuoteId={quoteId}
        />
        {!open && (
          <div className="flex items-center gap-3">
            <p data-testid="quote-builder-saved">Preventivo di prova salvato</p>
            <button
              type="button"
              data-testid="button-reopen-saved-quote"
              onClick={() =>
                window.location.assign(`${window.location.pathname}?loadSavedQuote=1`)
              }
            >
              Riapri preventivo salvato
            </button>
          </div>
        )}
      </main>
    </QueryClientProvider>
  );
}

import { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import QuoteBuilder from "@/components/quotes/QuoteBuilder";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";

const jobId = "e2e-quote-lifecycle-job";
const quoteId = "e2e-quote-lifecycle";

const cachedClauseTemplates = [
  {
    id: "e2e-clause-default",
    jobType: "matrimonio",
    titolo: "Clausole predefinite",
    clauses: [{ id: "default-clause", text: "Clausola predefinita", required: true, ordine: 1 }],
    attivo: true,
    predefinito: true,
    createdBy: "e2e",
  },
  {
    id: "e2e-clause-manual",
    jobType: "matrimonio",
    titolo: "Clausole scelte manualmente",
    clauses: [{ id: "manual-clause", text: "Clausola scelta manualmente", required: true, ordine: 1 }],
    attivo: true,
    predefinito: false,
    createdBy: "e2e",
  },
];

function QuoteBuilderLifecycleHarness() {
  const [open, setOpen] = useState(true);
  const [refreshState, setRefreshState] = useState("idle");
  const queryClient = useQueryClient();
  const { user } = useFirebaseAuth();

  useEffect(() => {
    const refresh = async () => {
      setRefreshState("loading");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["quotes", quoteId], refetchType: "active" }),
        queryClient.invalidateQueries({
          queryKey: ["contract-clause-templates"],
          refetchType: "active",
        }),
      ]);
      setRefreshState("complete");
    };
    const closeFromParent = () => setOpen(false);

    window.addEventListener("e2e:refresh-quote-queries", refresh);
    window.addEventListener("e2e:close-quote-builder", closeFromParent);
    return () => {
      window.removeEventListener("e2e:refresh-quote-queries", refresh);
      window.removeEventListener("e2e:close-quote-builder", closeFromParent);
    };
  }, [queryClient]);

  return (
    <main className="min-h-screen bg-background p-4">
      <div
        data-testid="quote-builder-auth-state"
        data-authenticated={user ? "true" : "false"}
        data-user-id={user?.uid ?? ""}
      />
      <div data-testid="quote-builder-refetch-state" data-state={refreshState} />
      <QuoteBuilder
        jobId={jobId}
        clienteId="e2e-quote-lifecycle-client"
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
        <button type="button" data-testid="reopen-quote-builder" onClick={() => setOpen(true)}>
          Riapri preventivo
        </button>
      )}
    </main>
  );
}

export default function QuoteBuilderLifecycleE2EHarness() {
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
    client.setQueryData(["contract-clause-templates"], cachedClauseTemplates);
    client.setQueryData(["quotes", "job", jobId], []);
    return client;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <QuoteBuilderLifecycleHarness />
    </QueryClientProvider>
  );
}

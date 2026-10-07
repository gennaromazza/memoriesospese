import { useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useParams } from "wouter";
import type { Job } from "@shared/jobs-types";
import ConsultationDateRangeFilter, {
  type ConsultationDateRange,
} from "@/components/jobs/ConsultationDateRangeFilter";
import CreateJobModal from "@/components/jobs/CreateJobModal";
import EditJobModal from "@/components/jobs/EditJobModal";
import GeneraPagamentiModal from "@/components/jobs/GeneraPagamentiModal";
import GestioneRataModal from "@/components/jobs/GestioneRataModal";
import RegistraPagamentoModal from "@/components/jobs/RegistraPagamentoModal";
import QuoteBuilder from "@/components/quotes/QuoteBuilder";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CashDashboardPeriodSelector, {
  type CashDashboardDateRange,
} from "@/components/CashDashboardPeriodSelector";
import JobDetailPage from "@/pages/JobDetailPage";

const fixtureDate = new Date(2026, 8, 15, 12);
const fixtureConsultationTemplate = {
  id: "e2e-consultation-template",
  nome: "Consulenza di prova",
  descrizione: "Template locale per il test",
  jobType: "matrimonio",
  durataMinuti: 30,
  attivo: true,
};

const fixtureJob = {
  id: "e2e-date-selector-job",
  nomeEvento: "Lavoro di prova date",
  clientiIds: [],
  orderIds: [],
  galleryIds: [],
  quoteIds: [],
  jobType: "matrimonio",
  eventDate: { toDate: () => new Date(fixtureDate) },
  dataNonDefinita: false,
  allDay: true,
  provenance: "e2e-date-selector",
  appuntamentiClienti: [],
  eventLocation: "",
  locationCerimonia: "",
  oraCerimonia: "",
  noteInterne: "",
} as unknown as Job;

function DateSelectorE2EContent() {
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [createJobOpen, setCreateJobOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [generatePaymentsOpen, setGeneratePaymentsOpen] = useState(false);
  const [installmentOpen, setInstallmentOpen] = useState(false);
  const [cashDateRange, setCashDateRange] =
    useState<CashDashboardDateRange>("month");
  const [cashDateFrom, setCashDateFrom] = useState(new Date(2026, 9, 4));
  const [cashDateTo, setCashDateTo] = useState(new Date(2026, 9, 4));
  const [consultationOpen, setConsultationOpen] = useState(false);
  const [consultationDateRange, setConsultationDateRange] =
    useState<ConsultationDateRange>({ from: undefined, to: undefined });

  return (
    <main className="min-h-screen bg-background p-4 sm:p-8">
      <h1 className="mb-6 text-xl font-semibold">Prova selettori data</h1>
      <section
        className="mb-8 space-y-3 rounded-lg border p-4"
        data-testid="cash-period-picker-fixture"
      >
        <h2 className="font-semibold">Periodo dashboard finanziaria</h2>
        <CashDashboardPeriodSelector
          dateRange={cashDateRange}
          onDateRangeChange={setCashDateRange}
          customDateFrom={cashDateFrom}
          customDateTo={cashDateTo}
          onCustomDatesChange={(from, to) => {
            setCashDateFrom(from);
            setCashDateTo(to);
          }}
        />
      </section>
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => setPaymentOpen(true)}>
          Apri pagamento di prova
        </Button>
        <Button type="button" onClick={() => setJobOpen(true)}>
          Apri modifica lavoro di prova
        </Button>
        <Button type="button" onClick={() => setCreateJobOpen(true)}>
          Apri creazione lavoro di prova
        </Button>
        <Button type="button" onClick={() => setQuoteOpen(true)} data-testid="open-quote-builder">
          Apri preventivo di prova
        </Button>
        <Button type="button" onClick={() => setGeneratePaymentsOpen(true)} data-testid="open-generate-payments">
          Apri generazione rate di prova
        </Button>
        <Button type="button" onClick={() => setInstallmentOpen(true)} data-testid="open-installment">
          Apri modifica rata di prova
        </Button>
        <Button
          type="button"
          onClick={() => setConsultationOpen(true)}
          data-testid="open-consultation-request"
        >
          Apri richiesta consulenza di prova
        </Button>
      </div>

      <Dialog
        open={consultationOpen}
        onOpenChange={(open) => {
          setConsultationOpen(open);
          if (!open) setConsultationDateRange({ from: undefined, to: undefined });
        }}
      >
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Invia Richiesta Consulenza</DialogTitle>
            <DialogDescription>
              Scegli come inviare la richiesta di appuntamento al cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <ConsultationDateRangeFilter
              value={consultationDateRange}
              onRangeChange={setConsultationDateRange}
            />
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                I giorni con un puntino hanno già impegni sul tuo calendario
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                data-testid="button-send-consultation"
              >
                Invia via Email
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConsultationOpen(false)}>
                Annulla
              </Button>
            </div>
          </div>
          <DialogFooter />
        </DialogContent>
      </Dialog>

      <RegistraPagamentoModal
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        scheduleId="e2e-date-selector-schedule"
        payment={{ id: "e2e-date-selector-payment", tipo: "Saldo", importo: 100 }}
        jobId={fixtureJob.id}
      />
      <EditJobModal
        open={jobOpen}
        onClose={() => setJobOpen(false)}
        job={fixtureJob}
      />
      <CreateJobModal
        open={createJobOpen}
        onClose={() => setCreateJobOpen(false)}
        initialDate={fixtureDate}
        skipNavigation
      />
      <QuoteBuilder
        jobId={fixtureJob.id}
        clienteId="e2e-date-selector-client"
        jobType={{ id: "e2e-matrimonio", slug: "matrimonio", nome: "Matrimonio" } as any}
        jobTypeSlug="matrimonio"
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
      />
      <GeneraPagamentiModal
        open={generatePaymentsOpen}
        onClose={() => setGeneratePaymentsOpen(false)}
        quoteId=""
        quoteTotale={100}
        jobId=""
        clienteId=""
        eventDate={fixtureDate}
      />
      <GestioneRataModal
        open={installmentOpen}
        onClose={() => setInstallmentOpen(false)}
        scheduleId=""
        jobId=""
        eventDate={fixtureDate}
        mode="edit"
        payment={{
          id: "e2e-date-selector-installment",
          tipo: "rata",
          importo: 50,
          dataScadenza: fixtureDate,
        }}
      />
    </main>
  );
}

export default function DateSelectorE2EHarness() {
  const { jobId } = useParams<{ jobId?: string }>();
  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
          queryFn: async ({ queryKey }) => {
            if (
              queryKey[0] ===
              `/api/consultations/templates/by-job-type/${fixtureJob.jobType}`
            ) {
              return [fixtureConsultationTemplate];
            }
            return [];
          },
        },
      },
    });

    client.setQueryData(["jobTypes"], [
      { id: "e2e-matrimonio", slug: "matrimonio", nome: "Matrimonio", attivo: true, ordine: 1 },
    ]);
    client.setQueryData(["jobProvenances"], [
      { id: "e2e-provenance", slug: "e2e-date-selector", nome: "Prova", icona: "•", attivo: true, ordine: 1 },
    ]);
    // Evita che i moduli amministrativi interroghino Firestore durante i test.
    client.setQueryData(["jobs", fixtureJob.id], fixtureJob);
    client.setQueryData(["jobs", jobId ?? fixtureJob.id], {
      ...fixtureJob,
      id: jobId ?? fixtureJob.id,
    });
    client.setQueryData(["timeline", jobId ?? fixtureJob.id], []);
    client.setQueryData(["quotes", jobId ?? fixtureJob.id], []);
    client.setQueryData(["quotes", "job", jobId ?? fixtureJob.id], []);
    client.setQueryData(["quotes", "financials", jobId ?? fixtureJob.id], []);
    client.setQueryData(["payment-schedules", jobId ?? fixtureJob.id], []);
    client.setQueryData(
      ["paymentSchedules", "aggregated", jobId ?? fixtureJob.id],
      [],
    );
    client.setQueryData(["collaboratori", "attivi"], []);
    client.setQueryData(["job-assignments", jobId ?? fixtureJob.id], []);
    client.setQueryData(["orders", "job", jobId ?? fixtureJob.id], []);
    client.setQueryData(["clienti", "job", ""], []);
    client.setQueryData(
      ["/api/collaboratori/assignments/job", jobId ?? fixtureJob.id],
      [],
    );
    client.setQueryData(["/api/collaboratori"], []);
    client.setQueryData(
      [`/api/photobooks/mockup-jobs/${encodeURIComponent(jobId ?? fixtureJob.id)}`],
      { contacts: [], books: [] },
    );
    client.setQueryData(
      ["/api/lab-shipments/job", jobId ?? fixtureJob.id],
      [],
    );
    client.setQueryData(["/api/labs", { attiviOnly: true }], []);
    client.setQueryData(["jobType", fixtureJob.jobType], {
      id: "e2e-matrimonio",
      slug: "matrimonio",
      nome: "Matrimonio",
    });
    client.setQueryData(
      [`/api/consultations/templates/by-job-type/${fixtureJob.jobType}`],
      [fixtureConsultationTemplate],
    );
    client.setQueryData(["quote-templates"], []);
    client.setQueryData(["products"], []);
    client.setQueryData(["contract-clause-templates"], []);

    return client;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {jobId ? <JobDetailPage /> : <DateSelectorE2EContent />}
    </QueryClientProvider>
  );
}
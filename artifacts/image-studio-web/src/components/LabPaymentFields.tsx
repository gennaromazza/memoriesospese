import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Job } from "@shared/jobs-types";
import type { Lab, LabSupplierStatementFE, StatoCostoLaboratorio } from "@shared/lab-types";
import { getAllJobs } from "@/lib/jobs";
import { getAllLabs } from "@/lib/labs";
import { getLabSupplierStatements } from "@/lib/lab-payments";
import { getRecentLabShipments } from "@/lib/labShipments";
import { buildLabJobSearchIndex, filterLabJobs, suggestedLabJobs } from "@/lib/lab-job-suggestions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";

export interface LabPaymentDraft {
  soloCosto: boolean;
  movementId: string;
  newStatementId: string;
  labId: string;
  labNome: string;
  statementId: string;
  statementNome: string;
  saldoDopo: string;
  jobToAdd: string;
  lavori: Array<{
    jobId: string;
    jobNome: string;
    descrizione: string;
    importo: string;
    stato: StatoCostoLaboratorio;
  }>;
  costiNonAttribuiti: Array<{
    costoId: string;
    descrizione: string;
    importo: string;
    stato: StatoCostoLaboratorio;
  }>;
}

export const NEW_LAB_STATEMENT = "__nuovo_conteggio__";

export function emptyLabPaymentDraft(): LabPaymentDraft {
  return {
    soloCosto: false,
    movementId: crypto.randomUUID(),
    newStatementId: crypto.randomUUID(),
    labId: "",
    labNome: "",
    statementId: "",
    statementNome: `Conteggio ${new Intl.DateTimeFormat("it-IT", { month: "2-digit", year: "numeric" }).format(new Date())}`,
    saldoDopo: "",
    jobToAdd: "",
    lavori: [],
    costiNonAttribuiti: [],
  };
}

interface Props {
  enabled: boolean;
  value: LabPaymentDraft;
  onChange: (value: LabPaymentDraft) => void;
  onReadyChange: (ready: boolean) => void;
}

function jobLabel(job: Job) {
  return job.nomeEvento || job.jobType || `Job ${job.id}`;
}

export default function LabPaymentFields({ enabled, value, onChange, onReadyChange }: Props) {
  const [jobSearch, setJobSearch] = useState("");
  const deferredJobSearch = useDeferredValue(jobSearch);
  useEffect(() => { setJobSearch(""); }, [value.labId]);
  const {
    data: labs = [], isLoading: labsLoading, isError: labsError,
    refetch: refetchLabs,
  } = useQuery<Lab[]>({
    queryKey: ["/api/labs", "cash-register-lab-payment"],
    queryFn: () => getAllLabs(true),
    enabled,
  });
  const {
    data: jobs = [], isLoading: jobsLoading, isError: jobsError,
    refetch: refetchJobs,
  } = useQuery<Job[]>({
    queryKey: ["jobs", "cash-register-cost-links"],
    queryFn: () => getAllJobs(),
    enabled,
    staleTime: 30_000,
  });
  const {
    data: statements = [], isLoading: statementsLoading, isError: statementsError,
    refetch: refetchStatements,
  } = useQuery<LabSupplierStatementFE[]>({
    queryKey: ["lab-supplier-statements"],
    queryFn: getLabSupplierStatements,
    enabled,
  });

  const { data: recentShipments = [], isLoading: shipmentsLoading, isError: shipmentsError,
    refetch: refetchShipments } = useQuery({
    queryKey: ["recent-lab-shipments", value.labId],
    queryFn: () => getRecentLabShipments(value.labId),
    enabled: enabled && !!value.labId,
    staleTime: 30_000,
  });

  useEffect(() => {
    onReadyChange(!enabled || (!labsLoading && !labsError && !statementsLoading && !statementsError));
  }, [enabled, labsLoading, labsError, statementsLoading, statementsError, onReadyChange]);

  const labStatements = useMemo(
    () => statements.filter((statement) => statement.labId === value.labId),
    [statements, value.labId],
  );
  const selectedIds = useMemo(() => new Set(value.lavori.map(line => line.jobId)), [value.lavori]);
  const searchIndex = useMemo(() => buildLabJobSearchIndex(jobs), [jobs]);
  const matchingJobs = useMemo(
    () => filterLabJobs(jobs, deferredJobSearch, searchIndex).filter(job => !selectedIds.has(job.id)),
    [jobs, deferredJobSearch, searchIndex, selectedIds],
  );
  const recentJobSuggestions = useMemo(
    () => suggestedLabJobs(recentShipments, jobs, value.labId, [], "", 100),
    [recentShipments, jobs, value.labId],
  );
  const suggestions = useMemo(
    () => {
      const matchingIds = new Set(matchingJobs.map(job => job.id));
      return recentJobSuggestions.filter(({ job }) => matchingIds.has(job.id)).slice(0, 6);
    },
    [recentJobSuggestions, matchingJobs],
  );

  const selectStatement = (id: string) => {
    if (id === NEW_LAB_STATEMENT) {
      onChange({
        ...value,
        statementId: "",
        statementNome: `Conteggio ${new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date())}`,
        newStatementId: crypto.randomUUID(),
        saldoDopo: "",
        lavori: [],
        costiNonAttribuiti: [],
        jobToAdd: "",
      });
      return;
    }
    const statement = statements.find((entry) => entry.id === id);
    if (!statement) return;
    onChange({
      ...value,
      statementId: statement.id,
      newStatementId: "",
      statementNome: statement.nome,
      saldoDopo: String(statement.saldoResiduo),
      jobToAdd: "",
      lavori: statement.lavori.map((line) => ({
        jobId: line.jobId,
        jobNome: line.jobNome,
        descrizione: line.descrizione,
        importo: String(line.importo),
        stato: line.stato,
      })),
      costiNonAttribuiti: (statement.costi || []).map((line) => ({
        costoId: line.costoId,
        descrizione: line.descrizione,
        importo: String(line.importo),
        stato: line.stato,
      })),
    });
  };

  const addJob = (jobId: string) => {
    const job = jobs.find((entry) => entry.id === jobId);
    if (selectedIds.has(jobId)) return;
    if (!job) return;
    setJobSearch("");
    onChange({
      ...value,
      jobToAdd: "",
      lavori: [...value.lavori, {
        jobId: job.id,
        jobNome: jobLabel(job),
        descrizione: `Costo laboratorio · ${jobLabel(job)}`,
        importo: "",
        stato: "stima",
      }],
    });
  };

  const updateLine = (jobId: string, patch: Partial<LabPaymentDraft["lavori"][number]>) => {
    onChange({
      ...value,
      lavori: value.lavori.map((line) => line.jobId === jobId ? { ...line, ...patch } : line),
    });
  };

  const removeJob = (jobId: string) => {
    if (value.statementId) return;
    onChange({ ...value, lavori: value.lavori.filter((line) => line.jobId !== jobId) });
  };

  const addUnassignedCost = (description = "") => onChange({
    ...value,
    costiNonAttribuiti: [...value.costiNonAttribuiti, {
      costoId: `draft_${crypto.randomUUID()}`,
      descrizione: description,
      importo: "",
      stato: "consuntivo",
    }],
  });

  const updateUnassignedCost = (costoId: string, patch: Partial<LabPaymentDraft["costiNonAttribuiti"][number]>) => {
    onChange({
      ...value,
      costiNonAttribuiti: value.costiNonAttribuiti.map((line) => line.costoId === costoId ? { ...line, ...patch } : line),
    });
  };

  const removeUnassignedCost = (costoId: string) => {
    if (!costoId.startsWith("draft_")) return;
    onChange({ ...value, costiNonAttribuiti: value.costiNonAttribuiti.filter((line) => line.costoId !== costoId) });
  };

  if (!enabled) return null;

  return (
    <section className="min-w-0 space-y-3 rounded-md border border-blue-200 bg-blue-50/50 p-2.5 sm:p-3" aria-label="Dettaglio pagamento laboratorio" data-testid="lab-payment-fields">
      <div>
        <h4 className="text-sm font-semibold">{value.soloCosto ? "Costo del laboratorio" : "Pagamento a un laboratorio"}</h4>
        <p className="text-xs text-muted-foreground">
          Il pagamento resta una sola uscita di cassa. Conteggio, costi dei Job e saldo sono salvati separatamente.
        </p>
      </div>
      {labsError && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
          <span>Non riesco a caricare i laboratori.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetchLabs()}>Riprova</Button>
        </div>
      )}
      {statementsError && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
          <span>Non riesco a verificare i conteggi già registrati; il salvataggio è sospeso per evitare duplicati.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetchStatements()}>Riprova</Button>
        </div>
      )}
      <div className="flex items-start gap-2 rounded border bg-background p-2">
        <Checkbox
          id="lab-entry-cost-only"
          checked={value.soloCosto}
          onCheckedChange={(checked) => onChange({ ...value, soloCosto: checked === true })}
          data-testid="lab-payment-cost-only"
        />
        <div>
          <Label htmlFor="lab-entry-cost-only" className="cursor-pointer text-sm font-medium">Registra solo i costi, senza un pagamento in cassa</Label>
          <p className="text-xs text-muted-foreground">Usalo per un addebito del laboratorio non ancora pagato. Non viene creato alcun movimento di cassa.</p>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Laboratorio *</Label>
        <Select
          value={value.labId || "__nessuno__"}
          onValueChange={(labId) => onChange({
            ...emptyLabPaymentDraft(),
            soloCosto: value.soloCosto,
            movementId: value.movementId,
            labId: labId === "__nessuno__" ? "" : labId,
            labNome: labs.find((lab) => lab.id === labId)?.nome || "",
          })}
        >
          <SelectTrigger aria-label="Laboratorio del pagamento" data-testid="lab-payment-lab">
            <SelectValue placeholder={labsLoading ? "Caricamento laboratori…" : "Seleziona laboratorio"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__nessuno__">Seleziona laboratorio</SelectItem>
            {labs.map((lab) => <SelectItem key={lab.id} value={lab.id}>{lab.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {value.labId && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1">
            <Label>Conteggio del laboratorio</Label>
            <Select value={value.statementId || NEW_LAB_STATEMENT} onValueChange={selectStatement}>
              <SelectTrigger aria-label="Conteggio laboratorio" data-testid="lab-payment-statement">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_LAB_STATEMENT}>Nuovo conteggio</SelectItem>
                {labStatements.map((statement) => (
                  <SelectItem key={statement.id} value={statement.id}>
                    {statement.nome} · residuo {statement.saldoResiduo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!value.statementId && (
              <Input
                value={value.statementNome}
                onChange={(event) => onChange({ ...value, statementNome: event.target.value })}
                aria-label="Nome del conteggio"
                placeholder="Es. Conteggio febbraio"
                maxLength={120}
              />
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <Label htmlFor="lab-payment-balance">Residuo dopo questo pagamento (€) *</Label>
            <Input
              id="lab-payment-balance"
              type="number"
              min="0"
              step="0.01"
              value={value.saldoDopo}
              onChange={(event) => onChange({ ...value, saldoDopo: event.target.value })}
              placeholder="0,00"
              data-testid="lab-payment-balance"
            />
            <p className="text-xs text-muted-foreground">È il saldo dichiarato dal laboratorio dopo l’acconto; non viene calcolato dai pagamenti.</p>
          </div>
          </div>

          <div className="space-y-2">
            <Label>Job inclusi e costo per Job (facoltativo)</Label>
            <p className="text-xs text-muted-foreground">
              Il laboratorio è obbligatorio, il Job no: puoi registrare stampe o altre spese senza collegarle a un lavoro.
            </p>
            <Input
              value={jobSearch}
              onChange={event => setJobSearch(event.target.value)}
              onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
              aria-label="Cerca un lavoro per cliente, nome, tipo o ID"
              placeholder="Cerca cliente o lavoro…"
              data-testid="lab-payment-job-search"
            />
            {shipmentsLoading && value.labId && <p className="text-xs text-muted-foreground">Caricamento ultimi invii al laboratorio…</p>}
            {shipmentsError && (
              <div role="alert" className="flex items-center justify-between gap-2 text-xs text-red-800">
                <span>Storico invii non disponibile. Puoi cercare un Job o registrare una spesa senza Job.</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void refetchShipments()}>Riprova invii</Button>
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="min-w-0 space-y-1" data-testid="lab-payment-recent-jobs">
                <p className="text-xs font-medium">Ultimi lavori inviati a {value.labNome}</p>
                <div className="grid max-h-52 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2">
                {suggestions.map(({ job, shipment }) => (
                  <Button key={job.id} type="button" variant="outline"
                    className="h-auto min-w-0 w-full items-start justify-start whitespace-normal p-2 text-left" onClick={() => addJob(job.id)}>
                    <span className="min-w-0 break-words">
                      <span className="block text-sm">{jobLabel(job)}</span>
                      {!!job.clientNames?.length && <span className="block text-xs font-normal">{job.clientNames.join(", ")}</span>}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {shipment.sourceType === "photobook" ? "Fotolibro" : "File di stampa"} inviato il {new Date(shipment.sentAt).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}
                        {shipment.descrizione ? ` · ${shipment.descrizione}` : ""} · Aggiungi al conteggio
                      </span>
                    </span>
                  </Button>
                ))}
                </div>
                <p className="text-xs text-muted-foreground">Sono suggerimenti dallo storico degli invii, non costi già verificati.</p>
              </div>
            )}
            {jobsLoading ? (
              <p className="text-xs text-muted-foreground">Caricamento Job…</p>
            ) : matchingJobs.length > 0 ? (
              <Select value={value.jobToAdd || "__nessuno__"} onValueChange={addJob}>
                <SelectTrigger aria-label="Aggiungi Job al conteggio" data-testid="lab-payment-add-job">
                  <SelectValue placeholder="Aggiungi un Job (facoltativo)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nessuno__">Aggiungi un Job…</SelectItem>
                  {matchingJobs.slice(0, 50).map((job) => (
                    <SelectItem key={job.id} value={job.id} className="whitespace-normal break-words">
                      {jobLabel(job)}{job.clientNames?.length ? ` · ${job.clientNames.join(", ")}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">
                {jobSearch.trim() ? "Nessun lavoro corrisponde alla ricerca." : jobs.length ? "Tutti i Job sono già inclusi." : "Nessun Job disponibile; il pagamento può restare non attribuito."}
              </p>
            )}
            {matchingJobs.length > 50 && (
              <p className="text-xs text-muted-foreground">
                Mostro i primi 50 di {matchingJobs.length} lavori. Scrivi il nome del cliente o del lavoro per restringere la ricerca.
              </p>
            )}
            {jobsError && (
              <div role="alert" className="flex items-center justify-between gap-2 text-sm text-red-800">
                <span>Non riesco a caricare i Job; puoi registrare il costo senza attribuirlo.</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void refetchJobs()}>Riprova</Button>
              </div>
            )}

            {value.lavori.length > 0 && (
              <div className="space-y-2">
                {value.lavori.map((line) => (
                  <div key={line.jobId} className="space-y-2 rounded border bg-background p-2" data-testid={`lab-payment-job-${line.jobId}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{line.jobNome}</p>
                        <p className="text-xs text-muted-foreground">Il costo viene registrato sul Job una sola volta per conteggio.</p>
                      </div>
                      {!value.statementId && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeJob(line.jobId)} aria-label={`Rimuovi ${line.jobNome}`}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Input
                      value={line.descrizione}
                      onChange={(event) => updateLine(line.jobId, { descrizione: event.target.value })}
                      aria-label={`Descrizione costo ${line.jobNome}`}
                      placeholder="Descrizione del costo"
                      maxLength={160}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.importo}
                        onChange={(event) => updateLine(line.jobId, { importo: event.target.value })}
                        aria-label={`Costo laboratorio ${line.jobNome} in euro`}
                        placeholder="Costo €"
                      />
                      <Select
                        value={line.stato}
                        onValueChange={(stato: StatoCostoLaboratorio) => updateLine(line.jobId, { stato })}
                      >
                        <SelectTrigger aria-label={`Stato costo ${line.jobNome}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stima">Stima</SelectItem>
                          <SelectItem value="consuntivo">Consuntivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Altre spese del conteggio (senza Job)</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => addUnassignedCost()} data-testid="lab-payment-add-unassigned-cost">
                  Aggiungi spesa senza Job
                </Button>
              </div>
              {value.costiNonAttribuiti.map((line) => {
                const savedLine = !line.costoId.startsWith("draft_");
                return (
                  <div key={line.costoId} className="space-y-2 rounded border bg-background p-2" data-testid={`lab-unassigned-cost-${line.costoId}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{savedLine ? "Costo già registrato" : "Nuovo costo non attribuito"}</span>
                      {!savedLine && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeUnassignedCost(line.costoId)} aria-label="Rimuovi costo non attribuito">
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Input
                      value={line.descrizione}
                      disabled={savedLine}
                      onChange={(event) => updateUnassignedCost(line.costoId, { descrizione: event.target.value })}
                      aria-label="Descrizione del costo non attribuito"
                      placeholder="Es. stampe, album o spese del laboratorio"
                      maxLength={160}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.importo}
                        disabled={savedLine}
                        onChange={(event) => updateUnassignedCost(line.costoId, { importo: event.target.value })}
                        aria-label="Importo del costo non attribuito"
                        placeholder="Costo €"
                      />
                      <Select
                        value={line.stato}
                        disabled={savedLine}
                        onValueChange={(stato: StatoCostoLaboratorio) => updateUnassignedCost(line.costoId, { stato })}
                      >
                        <SelectTrigger aria-label="Stato del costo non attribuito"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="stima">Stima</SelectItem>
                          <SelectItem value="consuntivo">Consuntivo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                Ogni spesa del laboratorio può essere registrata anche senza Job. I pagamenti e i residui non vengono contati di nuovo come spesa.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Non collegare i Job storici senza una prova. Se il costo per un Job non è ancora stimabile, non aggiungerlo al conteggio.</p>
          </div>
        </>
      )}
    </section>
  );
}
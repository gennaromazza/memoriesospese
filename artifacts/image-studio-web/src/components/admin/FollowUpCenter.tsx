import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, Clock3, Mail, Pause, Play, RefreshCw, Send, UserRound } from "lucide-react";
import type { FollowUpDashboardResponse, FollowUpDashboardItem, FollowUpTemplate } from "@shared/follow-up-types";

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Attivo",
    snoozed: "Posticipato",
    dormant: "Dormiente",
    suspended: "Sospeso",
    converted: "Convertito",
    not_interested: "Non interessato",
    superseded: "Sostituito",
    pending_approval: "In approvazione",
  };
  return labels[status] || status;
}

function statusClass(status: string) {
  if (status === "active") return "bg-emerald-100 text-emerald-800";
  if (status === "snoozed") return "bg-amber-100 text-amber-800";
  if (status === "converted") return "bg-blue-100 text-blue-800";
  if (status === "dormant") return "bg-stone-100 text-stone-700";
  return "bg-rose-100 text-rose-800";
}

export default function FollowUpCenter() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, FollowUpTemplate>>({});
  const [filter, setFilter] = useState("all");

  const { data, isLoading, isFetching, refetch } = useQuery<FollowUpDashboardResponse>({
    queryKey: ["/api/follow-ups/dashboard"],
    refetchInterval: 60000,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ quoteId, action, body }: { quoteId: string; action: string; body?: Record<string, unknown> }) => {
      const response = await apiRequest("POST", `/api/follow-ups/${quoteId}/${action}`, body);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups/dashboard"] });
      toast({ title: "Follow-up aggiornato", description: "La sequenza è stata aggiornata." });
    },
    onError: (error: Error) => toast({ title: "Operazione non riuscita", description: error.message, variant: "destructive" }),
  });

  const runMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/follow-ups/run")).json(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups/dashboard"] });
      toast({ title: "Controllo completato", description: `${result.result?.sent || 0} follow-up inviati.` });
    },
    onError: (error: Error) => toast({ title: "Controllo non riuscito", description: error.message, variant: "destructive" }),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (template: FollowUpTemplate) => {
      const response = await apiRequest("PUT", `/api/follow-ups/templates/${template.id}`, template);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups/dashboard"] });
      toast({ title: "Template salvato" });
    },
    onError: (error: Error) => toast({ title: "Template non salvato", description: error.message, variant: "destructive" }),
  });

  const items = (data?.items || []).filter((item) => filter === "all" || item.status === filter || (filter === "due" && item.reason));
  const templates = data?.templates || [];
  const persistenceFailures = data?.persistenceFailures || [];

  const updateTemplate = (template: FollowUpTemplate, patch: Partial<FollowUpTemplate>) => {
    setTemplateDrafts((current) => ({ ...current, [template.id]: { ...template, ...current[template.id], ...patch } }));
  };

  const draftFor = (template: FollowUpTemplate) => templateDrafts[template.id] || template;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Send className="h-6 w-6 text-emerald-700" />
            <h2 className="text-2xl font-bold text-stone-900">Centro Follow-up</h2>
            <Badge className="bg-emerald-100 text-emerald-800">Automatico</Badge>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Monitora i preventivi non firmati. Gli invii partono da soli ai giorni 3, 10 e 25.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Aggiorna
          </Button>
          <Button size="sm" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
            <Play className="mr-2 h-4 w-4" /> Esegui controllo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {[
          ["Attivi", data?.stats.active || 0],
          ["In scadenza", data?.stats.due || 0],
          ["Posticipati", data?.stats.snoozed || 0],
          ["Dormienti", data?.stats.dormant || 0],
          ["Sospesi", data?.stats.suspended || 0],
          ["Convertiti", data?.stats.converted || 0],
          ["Valore assistito", `€${(data?.stats.assistedValue || 0).toFixed(0)}`],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs text-stone-500">{label}</p>
              <p className="mt-1 text-xl font-bold text-stone-900">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {persistenceFailures.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-700" />
              <CardTitle className="text-amber-950">Invii da verificare</CardTitle>
            </div>
            <CardDescription className="text-amber-900/80">
              Gmail ha accettato questi follow-up, ma una registrazione interna non è stata completata. Il blocco anti-doppio invio è rimasto attivo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {persistenceFailures.map((failure) => (
              <div key={failure.id || `${failure.quoteId}-${failure.step}-${failure.occurredAt}`} className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium text-amber-950">
                  <span>Preventivo {failure.quoteId}</span>
                  <span>Step {failure.step}</span>
                  <Badge className="bg-amber-100 text-amber-900">{failure.persistence === "state" ? "Stato" : "Audit"}</Badge>
                  <span className="font-normal text-amber-900/70">{formatDate(failure.occurredAt)}</span>
                </div>
                <p className="mt-1 text-xs text-amber-900/80">{failure.error}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Lead monitorati</CardTitle>
              <CardDescription>Il valore assistito indica firme registrate dopo almeno un evento follow-up.</CardDescription>
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="active">Attivi</SelectItem>
                <SelectItem value="due">In scadenza</SelectItem>
                <SelectItem value="snoozed">Posticipati</SelectItem>
                <SelectItem value="suspended">Sospesi</SelectItem>
                <SelectItem value="dormant">Dormienti</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-sm text-stone-500">Caricamento follow-up…</div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-stone-500">
              Nessun preventivo nel filtro selezionato. Il prossimo controllo acquisirà i nuovi preventivi inviati.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => <FollowUpRow key={item.quoteId} item={item} onAction={(action, body) => actionMutation.mutate({ quoteId: item.quoteId, action, body })} />)}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader>
            <CardTitle>Invii per step</CardTitle>
            <CardDescription>Conteggio dei follow-up già inviati.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center justify-between rounded-lg bg-stone-50 px-4 py-3">
                <span className="text-sm font-medium">Step {step}</span>
                <span className="text-lg font-bold">{data?.stats.sentByStep[String(step)] || 0}</span>
              </div>
            ))}
            <p className="pt-2 text-xs text-stone-500">
              Le risposte email non vengono ancora sincronizzate automaticamente: usa “Segna risposta” quando necessario.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Template automatici</CardTitle>
            <CardDescription>Modifica subject e testo senza toccare il sistema di invio bulk.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {templates.map((template) => {
              const draft = draftFor(template);
              return (
                <div key={template.id} className="space-y-2 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <Label>Step {template.step} · {template.name}</Label>
                    <Button size="sm" onClick={() => saveTemplateMutation.mutate(draft)} disabled={saveTemplateMutation.isPending}>Salva</Button>
                  </div>
                  <Input value={draft.subject} onChange={(event) => updateTemplate(template, { subject: event.target.value })} placeholder="Oggetto email" />
                  <Textarea value={draft.bodyHtml} onChange={(event) => updateTemplate(template, { bodyHtml: event.target.value })} rows={3} placeholder="Testo HTML del messaggio" />
                  <p className="text-xs text-stone-500">Placeholder: [nome cliente], [nome coppia], [data evento], [importo preventivo], [url preventivo]</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FollowUpRow({ item, onAction }: { item: FollowUpDashboardItem; onAction: (action: string, body?: Record<string, unknown>) => void }) {
  const [days, setDays] = useState("7");
  const due = Boolean(item.reason);
  return (
    <div className={`rounded-xl border p-4 ${due ? "border-amber-300 bg-amber-50/50" : "border-stone-200"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <UserRound className="h-4 w-4 text-stone-500" />
            <span className="font-semibold text-stone-900">{item.clientName}</span>
            <Badge className={statusClass(item.status)}>{statusLabel(item.status)}</Badge>
            {due && <Badge className="bg-amber-100 text-amber-800"><AlertCircle className="mr-1 h-3 w-3" /> Da verificare</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
            <span><Mail className="mr-1 inline h-3 w-3" />{item.email || "email non disponibile"}</span>
            <span>{item.eventName || "Evento senza nome"}</span>
            {item.eventDate && <span>Evento: {formatDate(item.eventDate)}</span>}
            <span>Step inviati: {(item.sentSteps || []).join(", ") || "nessuno"}</span>
            {item.nextDueAt && <span><Clock3 className="mr-1 inline h-3 w-3" />Prossimo: {formatDate(item.nextDueAt)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.status === "snoozed" ? (
            <Button size="sm" variant="outline" onClick={() => onAction("resume")}><Play className="mr-1 h-3.5 w-3.5" /> Riprendi</Button>
          ) : item.status !== "converted" && item.status !== "not_interested" ? (
            <>
              <div className="flex items-center gap-1">
                <Input className="h-8 w-16" type="number" min={1} max={90} value={days} onChange={(event) => setDays(event.target.value)} aria-label="Giorni posticipo" />
                <Button size="sm" variant="outline" onClick={() => onAction("snooze", { days: Number(days) })}><Pause className="mr-1 h-3.5 w-3.5" /> Posticipa</Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => onAction("contact", { channel: "manual" })}>Segna contatto</Button>
              <Button size="sm" variant="outline" onClick={() => onAction("reply", { channel: "email" })}>Segna risposta</Button>
              <Button size="sm" variant="ghost" onClick={() => onAction("not-interested")}>Non interessato</Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
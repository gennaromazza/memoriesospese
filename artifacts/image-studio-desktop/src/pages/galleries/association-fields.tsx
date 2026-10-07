import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClients, useJobs, useJobTypes } from '../../lib/api-hooks';
import {
  clientLabel, clientMatchesSearch, jobClientIds, jobLabel, jobClientNames,
  clientsAfterRemovingJob, jobTypeAfterSelection, mergeJobClientIds, suggestedJobs,
} from '../../lib/gallery-associations';

interface Props {
  idPrefix: string;
  jobId: string;
  clientIds: string[];
  jobType: string;
  clearJobAddedClientsOnRemove: boolean;
  onChange: (jobId: string, clientIds: string[], jobType?: string) => void;
}

export function GalleryAssociationFields({
  idPrefix, jobId, clientIds, jobType, clearJobAddedClientsOnRemove, onChange,
}: Props) {
  const [search, setSearch] = useState('');
  const [jobSearch, setJobSearch] = useState('');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categoryAutoSet, setCategoryAutoSet] = useState(false);
  const [autoAddedClientIds, setAutoAddedClientIds] = useState<string[]>([]);
  const clients = useClients();
  const jobs = useJobs();
  const types = useJobTypes();
  const selectedJob = jobs.data?.find(job => job.id === jobId);
  const clientList = clients.data || [];
  const matchingJobs = useMemo(
    () => suggestedJobs(jobs.data || [], clientList, jobSearch, clientIds).slice(0, 30),
    [clientIds, clientList, jobSearch, jobs.data],
  );
  const jobRequiredClientIds = selectedJob ? jobClientIds(selectedJob) : [];
  const requiredClientIds = new Set(jobRequiredClientIds);
  const selectJob = (nextJobId: string) => {
    const nextJob = jobs.data?.find(job => job.id === nextJobId);
    const addedClientIds = nextJob
      ? jobClientIds(nextJob).filter(id => !clientIds.includes(id))
      : [];
    const nextClientIds = nextJob
      ? mergeJobClientIds(clientIds, nextJob)
      : clientsAfterRemovingJob(clientIds, autoAddedClientIds, clearJobAddedClientsOnRemove);
    setAutoAddedClientIds(nextJob
      ? [...new Set([...autoAddedClientIds, ...addedClientIds])]
      : []);
    const nextJobType = jobTypeAfterSelection(jobType, nextJob?.jobType, categoryTouched, categoryAutoSet);
    setCategoryAutoSet(nextJobType.automaticallySet);
    onChange(nextJobId, nextClientIds, nextJobType.value);
    setJobSearch('');
  };
  const visibleClients = (clients.data || []).filter(client =>
    clientIds.includes(client.id) || clientMatchesSearch(client, search),
  );
  const missingIds = clientIds.filter(id => !(clients.data || []).some(client => client.id === id));

  useEffect(() => {
    if (!selectedJob) return;
    const nextClientIds = mergeJobClientIds(clientIds, selectedJob);
    const addedClientIds = nextClientIds.filter(id => !clientIds.includes(id));
    const nextJobType = jobTypeAfterSelection(jobType, selectedJob.jobType, categoryTouched, categoryAutoSet);
    if (nextClientIds.length !== clientIds.length || nextJobType.value !== jobType) {
      if (addedClientIds.length > 0) {
        setAutoAddedClientIds(current => [...new Set([...current, ...addedClientIds])]);
      }
      setCategoryAutoSet(nextJobType.automaticallySet);
      onChange(jobId, nextClientIds, nextJobType.value);
    }
  }, [categoryAutoSet, categoryTouched, clientIds, jobId, jobType, onChange, selectedJob]);

  return (
    <section className="space-y-4" aria-labelledby={`${idPrefix}-association-title`}>
      <div>
        <h4 id={`${idPrefix}-association-title`} className="text-sm font-semibold text-foreground">Collega Job e clienti</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Scegliendo un Job vengono selezionati i suoi clienti. Quelli marcati “dal Job” restano associati finché il Job è selezionato; puoi aggiungere o rimuovere gli altri clienti qui sotto.
          {clearJobAddedClientsOnRemove
            ? ' Se rimuovi il Job, vengono rimossi solo i clienti aggiunti automaticamente.'
            : ' Rimuovere il Job non elimina i clienti già associati.'}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-job-search`}>Job associato</Label>
        <Input
          id={`${idPrefix}-job-search`}
          type="search"
          value={jobSearch}
          onChange={event => setJobSearch(event.target.value)}
          placeholder="Cerca per nome Job, cliente o email"
          autoComplete="off"
          disabled={jobs.isLoading || jobs.isError}
          aria-controls={`${idPrefix}-job-results`}
        />
        {selectedJob ? (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{jobLabel(selectedJob)}</p>
              {jobClientNames(selectedJob, clientList).length > 0 &&
                <p className="truncate text-xs text-muted-foreground">{jobClientNames(selectedJob, clientList).join(', ')}</p>}
            </div>
            <button type="button" className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => selectJob('')}>
              Rimuovi Job
            </button>
          </div>
        ) : jobId && jobs.isLoading ? (
          <p role="status" className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Verifica del Job salvato…</p>
        ) : jobId && jobs.isError ? (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="truncate text-muted-foreground">Impossibile verificare il Job salvato ({jobId}).</span>
            <button type="button" className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => selectJob('')}>
              Rimuovi Job
            </button>
          </div>
        ) : jobId ? (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="truncate text-muted-foreground">Job non disponibile ({jobId})</span>
            <button type="button" className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => selectJob('')}>
              Rimuovi Job
            </button>
          </div>
        ) : clientIds.length > 0 ? (
          <p className="text-xs text-muted-foreground">Job collegati ai clienti selezionati, oppure cerca per nome Job, cliente o email.</p>
        ) : (
          <p className="text-xs text-muted-foreground">Scrivi il nome del lavoro o di uno dei clienti collegati per trovarlo.</p>
        )}
        {(jobSearch.trim() || (!jobId && !jobs.isLoading && !jobs.isError && clientIds.length > 0)) && !jobs.isLoading && !jobs.isError && (
          matchingJobs.length > 0 ? (
            <div id={`${idPrefix}-job-results`} role="listbox" aria-label="Risultati Job"
              className="max-h-64 overflow-y-auto rounded-md border border-input bg-background p-1">
              {matchingJobs.map(job => (
                <button key={job.id} type="button" role="option" aria-selected={job.id === jobId}
                  className="flex w-full flex-col items-start gap-0.5 rounded px-3 py-2 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => selectJob(job.id)}>
                  <span className="font-medium">{jobLabel(job)}</span>
                  {jobClientNames(job, clientList).length > 0 &&
                    <span className="text-xs text-muted-foreground">Clienti: {jobClientNames(job, clientList).join(', ')}</span>}
                </button>
              ))}
            </div>
          ) : (
            <p id={`${idPrefix}-job-results`} role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
              {jobSearch.trim()
                ? `Nessun Job trovato per “${jobSearch.trim()}”.`
                : 'Nessun Job collegato ai clienti selezionati.'}
            </p>
          )
        )}
        {matchingJobs.length === 30 && <p className="text-xs text-muted-foreground">Mostrati i primi 30 risultati. Aggiungi altri caratteri per restringere la ricerca.</p>}
        {jobs.isLoading && <p role="status" className="text-xs text-muted-foreground">Caricamento Job…</p>}
        {jobs.isError && (
          <div role="alert" className="flex items-center justify-between gap-3 text-xs text-destructive">
            <span>Impossibile caricare i Job.</span>
            <button type="button" disabled={jobs.isFetching}
              onClick={() => void jobs.refetch()}
              className="shrink-0 underline underline-offset-2 disabled:opacity-50">
              {jobs.isFetching ? 'Caricamento…' : 'Riprova'}
            </button>
          </div>
        )}
        {!jobs.isLoading && !jobs.isError && jobs.data?.length === 0 && <p className="text-xs text-muted-foreground">Non ci sono Job disponibili.</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-job-type`}>Categoria / Tipo evento</Label>
        <select
          id={`${idPrefix}-job-type`}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={jobType}
          disabled={types.isLoading || types.isError}
          onChange={event => {
            setCategoryTouched(true);
            setCategoryAutoSet(false);
            onChange(jobId, clientIds, event.target.value);
          }}
        >
          <option value="">— Nessuna categoria —</option>
          {jobType && !types.data?.some(type => type.slug === jobType) &&
            <option value={jobType} disabled>{jobType} (categoria precedente)</option>}
          {types.data?.map(type => (
            <option key={type.id} value={type.slug}>{type.icona ? `${type.icona} ` : ''}{type.nome}</option>
          ))}
        </select>
        {types.isLoading && <p role="status" className="text-xs text-muted-foreground">Caricamento categorie…</p>}
        {types.isError && (
          <div role="alert" className="flex items-center justify-between gap-3 text-xs text-destructive">
            <span>Impossibile caricare le categorie centralizzate.</span>
            <button type="button" disabled={types.isFetching}
              onClick={() => void types.refetch()}
              className="shrink-0 underline underline-offset-2 disabled:opacity-50">
              {types.isFetching ? 'Caricamento…' : 'Riprova'}
            </button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-client-search`}>Clienti associati ({clientIds.length})</Label>
        <Input
          id={`${idPrefix}-client-search`}
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Cerca un cliente per nome o email"
          disabled={clients.isLoading || clients.isError}
        />
        {clients.isLoading && <p role="status" className="text-xs text-muted-foreground">Caricamento clienti…</p>}
        {clients.isError && (
          <div role="alert" className="flex items-center justify-between gap-3 text-xs text-destructive">
            <span>Impossibile caricare i clienti.</span>
            <button type="button" disabled={clients.isFetching}
              onClick={() => void clients.refetch()}
              className="shrink-0 underline underline-offset-2 disabled:opacity-50">
              {clients.isFetching ? 'Caricamento…' : 'Riprova'}
            </button>
          </div>
        )}
        {!clients.isError && !clients.isLoading && (
          <div className="max-h-48 overflow-y-auto rounded-md border border-input bg-background p-1" role="group" aria-label="Clienti da associare">
            {visibleClients.map(client => (
              <label key={client.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={clientIds.includes(client.id)}
                  disabled={requiredClientIds.has(client.id)}
                  onChange={event => {
                    setAutoAddedClientIds(current => current.filter(id => id !== client.id));
                    onChange(jobId, event.target.checked
                      ? [...clientIds, client.id]
                      : clientIds.filter(id => id !== client.id && !requiredClientIds.has(id)), jobType);
                  }}
                  className="h-4 w-4 accent-primary"
                />
                <span>{clientLabel(client)}{client.email && clientLabel(client) !== client.email ? ` · ${client.email}` : ''}{requiredClientIds.has(client.id) && <span className="ml-2 text-xs text-muted-foreground">dal Job</span>}</span>
              </label>
            ))}
            {missingIds.map(id => (
              <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm text-muted-foreground">
                <input type="checkbox" checked disabled={requiredClientIds.has(id)} onChange={() => onChange(jobId, clientIds.filter(value => value !== id), jobType)} />
                Cliente non disponibile ({id}){requiredClientIds.has(id) && <span className="text-xs">dal Job</span>}
              </label>
            ))}
            {visibleClients.length === 0 && missingIds.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">{search ? 'Nessun cliente trovato.' : 'Non ci sono clienti disponibili.'}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
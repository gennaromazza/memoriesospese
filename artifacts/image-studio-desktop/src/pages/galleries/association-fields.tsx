import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClients, useJobs, useJobTypes } from '../../lib/api-hooks';
import { clientLabel, jobClientIds, jobLabel, mergeJobClientIds } from '../../lib/gallery-associations';

interface Props {
  idPrefix: string;
  jobId: string;
  clientIds: string[];
  jobType: string;
  onChange: (jobId: string, clientIds: string[], jobType?: string) => void;
}

export function GalleryAssociationFields({ idPrefix, jobId, clientIds, jobType, onChange }: Props) {
  const [search, setSearch] = useState('');
  const clients = useClients();
  const jobs = useJobs();
  const types = useJobTypes();
  const selectedJob = jobs.data?.find(job => job.id === jobId);
  const jobRequiredClientIds = selectedJob ? jobClientIds(selectedJob) : [];
  const requiredClientIds = new Set(jobRequiredClientIds);
  const visibleClients = (clients.data || []).filter(client =>
    clientIds.includes(client.id) || clientLabel(client).toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it')),
  );
  const missingIds = clientIds.filter(id => !(clients.data || []).some(client => client.id === id));

  useEffect(() => {
    if (!selectedJob) return;
    const nextClientIds = mergeJobClientIds(clientIds, selectedJob);
    const nextJobType = (!jobType || jobType === 'none') && selectedJob.jobType
      ? selectedJob.jobType : jobType;
    if (nextClientIds.length !== clientIds.length || nextJobType !== jobType) {
      onChange(jobId, nextClientIds, nextJobType);
    }
  }, [clientIds, jobId, jobType, onChange, selectedJob]);

  return (
    <section className="space-y-4" aria-labelledby={`${idPrefix}-association-title`}>
      <div>
        <h4 id={`${idPrefix}-association-title`} className="text-sm font-semibold text-foreground">Collega Job e clienti</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Scegliendo un Job vengono selezionati i suoi clienti. Puoi aggiungerli o rimuoverli qui sotto.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-job`}>Job associato</Label>
        <select
          id={`${idPrefix}-job`}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={jobId}
          disabled={jobs.isLoading || jobs.isError}
          onChange={event => {
            const nextJobId = event.target.value;
            const nextJob = jobs.data?.find(job => job.id === nextJobId);
            const nextClientIds = nextJob ? mergeJobClientIds(clientIds, nextJob) : clientIds;
            const nextJobType = (!jobType || jobType === 'none') && nextJob?.jobType
              ? nextJob.jobType : jobType;
            onChange(nextJobId, nextClientIds, nextJobType);
          }}
        >
          <option value="">Nessun Job</option>
          {jobId && !jobs.data?.some(job => job.id === jobId) && <option value={jobId}>Job non disponibile ({jobId})</option>}
          {jobs.data?.map(job => <option key={job.id} value={job.id}>{jobLabel(job)}</option>)}
        </select>
        {jobs.isLoading && <p className="text-xs text-muted-foreground">Caricamento Job…</p>}
        {jobs.isError && <p role="alert" className="text-xs text-destructive">Impossibile caricare i Job. Riapri la pagina e riprova.</p>}
        {!jobs.isLoading && !jobs.isError && jobs.data?.length === 0 && <p className="text-xs text-muted-foreground">Non ci sono Job disponibili.</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-job-type`}>Categoria / Tipo evento</Label>
        <select
          id={`${idPrefix}-job-type`}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={jobType}
          disabled={types.isLoading || types.isError}
          onChange={event => onChange(jobId, clientIds, event.target.value)}
        >
          <option value="">— Nessuna categoria —</option>
          {jobType && !types.data?.some(type => type.slug === jobType) &&
            <option value={jobType} disabled>{jobType} (categoria precedente)</option>}
          {types.data?.map(type => (
            <option key={type.id} value={type.slug}>{type.icona ? `${type.icona} ` : ''}{type.nome}</option>
          ))}
        </select>
        {types.isLoading && <p className="text-xs text-muted-foreground">Caricamento categorie…</p>}
        {types.isError && <p role="alert" className="text-xs text-destructive">Impossibile caricare le categorie centralizzate. Riprova più tardi.</p>}
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
        {clients.isLoading && <p className="text-xs text-muted-foreground">Caricamento clienti…</p>}
        {clients.isError && <p role="alert" className="text-xs text-destructive">Impossibile caricare i clienti. Riapri la pagina e riprova.</p>}
        {!clients.isError && !clients.isLoading && (
          <div className="max-h-48 overflow-y-auto rounded-md border border-input bg-background p-1" role="group" aria-label="Clienti da associare">
            {visibleClients.map(client => (
              <label key={client.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={clientIds.includes(client.id)}
                  disabled={requiredClientIds.has(client.id)}
                  onChange={event => onChange(jobId, event.target.checked
                    ? [...clientIds, client.id]
                    : clientIds.filter(id => id !== client.id && !requiredClientIds.has(id)), jobType)}
                  className="h-4 w-4 accent-primary"
                />
                <span>{clientLabel(client)}{client.email && clientLabel(client) !== client.email ? ` · ${client.email}` : ''}{requiredClientIds.has(client.id) && <span className="ml-2 text-xs text-muted-foreground">dal Job</span>}</span>
              </label>
            ))}
            {missingIds.map(id => (
              <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 text-sm text-muted-foreground">
                <input type="checkbox" checked onChange={() => onChange(jobId, clientIds.filter(value => value !== id))} />
                Cliente non disponibile ({id})
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
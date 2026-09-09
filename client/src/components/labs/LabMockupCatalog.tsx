import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MOCKUP_RENDERERS } from '@shared/mockup-catalog';
import { labMockupCatalogSchema, type LabMockupCatalog as Catalog, type LabMockupModel } from '@shared/mockup-workflow';
import seed from '../../../public/mockups/custodia-v1/peppe-lab-catalog.json';

export default function LabMockupCatalog({ labId }: { labId: string }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const base = `/api/labs/${encodeURIComponent(labId)}/mockup-catalog`;
  const query = useQuery<Catalog>({ queryKey: [base], queryFn: async () => (await apiRequest('GET', base)).json() });
  const catalog = draft || query.data;
  const update = (id: string, patch: Partial<LabMockupModel>) => catalog && setDraft({ ...catalog, models: catalog.models.map(m => m.id === id ? { ...m, ...patch } : m) });
  const importMaterials = () => catalog && setDraft({ ...catalog, materials: seed.variants.map(v => catalog.materials.find(m => m.id === v.id) || { id: v.id, label: v.label, supplierCode: v.supplierCode || '' }) });
  async function save() {
    const parsed = labMockupCatalogSchema.safeParse(catalog);
    if (!parsed.success) { setMessage('Controlla i nomi e seleziona almeno un rivestimento per ogni modello 3D.'); return; }
    setBusy(true);
    try {
      const saved: Catalog = await (await apiRequest('PUT', base, parsed.data)).json();
      queryClient.setQueryData([base], saved); setDraft(null); setEditingId(null);
      setMessage('Catalogo salvato. Le proposte già pubblicate non sono state cambiate.');
    }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Qui trovi i modelli associati a questo laboratorio. Per proporli a un cliente, dovrai poi selezionarli nel suo fotolibro.</p>
    {query.isLoading && <p role="status">Caricamento modelli…</p>}
    {query.isError && <p role="alert">Impossibile caricare il catalogo.</p>}
    {catalog && <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold">Modelli del laboratorio ({catalog.models.length})</h3>
      <Button variant="outline" disabled={busy || catalog.models.length >= 50} onClick={() => {
        const id = crypto.randomUUID();
        setDraft({ ...catalog, models: [...catalog.models, { id, name: '', supplierCode: '', rendererId: null, active: true, materialIds: [] }] });
        setEditingId(id); setMessage('');
      }}>Aggiungi modello</Button>
    </div>}
    {catalog && !catalog.models.length && <div className="rounded-lg border border-dashed p-6 text-center"><p className="font-medium">Nessun modello associato</p><p className="text-sm text-muted-foreground mt-1">Usa “Aggiungi modello” per inserire il primo album di questo laboratorio.</p></div>}
    {catalog?.models.map(model => <section key={model.id} className="border rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-muted/30">
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold break-words">{model.name.trim() || 'Nuovo modello — inserisci il nome'}</h4>
          <p className="text-sm text-muted-foreground">{MOCKUP_RENDERERS.find(r => r.id === model.rendererId)?.name || 'Tipo di anteprima da scegliere'} · {model.materialIds.length} rivestimenti</p>
          <div className="flex flex-wrap gap-2 mt-2 text-xs">
            <span className="rounded-full border px-2 py-1">{!model.active ? 'Non disponibile' : !model.rendererId || !model.name.trim() || !model.materialIds.length ? 'Da completare' : 'Disponibile per le proposte'}</span>
            {!query.data?.models.some(m => m.id === model.id) && <span className="rounded-full bg-amber-100 text-amber-900 px-2 py-1">Nuovo · non salvato</span>}
          </div>
        </div>
        <Button variant="outline" disabled={busy} aria-expanded={editingId === model.id} aria-controls={`model-${model.id}`} onClick={() => setEditingId(editingId === model.id ? null : model.id)}>{editingId === model.id ? 'Chiudi dettagli' : 'Modifica'}</Button>
      </div>
      {editingId === model.id && <fieldset id={`model-${model.id}`} disabled={busy} className="p-4 space-y-3 border-t">
      <label className="block">Nome mostrato al cliente<Input maxLength={100} value={model.name} onChange={e => update(model.id, { name: e.target.value })} /></label>
      <label className="block">Codice modello del fornitore (facoltativo)<Input maxLength={100} value={model.supplierCode} onChange={e => update(model.id, { supplierCode: e.target.value })} /></label>
      <label className="block">Modello 3D<select aria-label="Modello 3D" className="block border rounded p-2 w-full" value={model.rendererId || ''} onChange={e => update(model.id, { rendererId: MOCKUP_RENDERERS.find(r => r.id === e.target.value)?.id || null, materialIds: e.target.value && !model.materialIds.length ? catalog.materials.map(m => m.id) : model.materialIds })}><option value="">Da integrare — non proponibile al cliente</option>{MOCKUP_RENDERERS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={model.active} onChange={e => update(model.id, { active: e.target.checked })} />Disponibile nel catalogo</label>
      {model.rendererId && <details><summary className="cursor-pointer">Rivestimenti compatibili del laboratorio ({model.materialIds.length})</summary>
        {!catalog.materials.length && <p>Importa prima il campionario qui sotto.</p>}
        {catalog.materials.map(material => <label key={material.id} className="flex gap-2 py-1"><input type="checkbox" checked={model.materialIds.includes(material.id)} onChange={e => update(model.id, { materialIds: e.target.checked ? [...model.materialIds, material.id] : model.materialIds.filter(id => id !== material.id) })} />{material.label}</label>)}
      </details>}
      <p className="text-xs text-muted-foreground">Le modifiche saranno applicate con “Salva catalogo”. Per non proporre più questo modello, togli la disponibilità senza perdere i suoi dati.</p>
    </fieldset>}</section>)}
    {catalog && <details className="border rounded p-3"><summary className="cursor-pointer">Campionario del laboratorio ({catalog.materials.length})</summary>
      <p className="text-xs my-2">Nomi e codici sono comuni ai modelli di questo laboratorio. Importa Custodia solo nell’anagrafica del suo fornitore reale.</p>
      <Button variant="outline" disabled={busy} onClick={importMaterials}>Importa campionario Custodia / Peppe Lab</Button>
      {catalog.materials.map(material => <div key={material.id} className="grid sm:grid-cols-2 gap-2 py-2"><Input disabled={busy} aria-label={`Nome ${material.label}`} maxLength={100} value={material.label} onChange={e => setDraft({ ...catalog, materials: catalog.materials.map(m => m.id === material.id ? { ...m, label: e.target.value } : m) })} /><Input disabled={busy} aria-label={`Codice fornitore ${material.label}`} maxLength={100} placeholder="Codice fornitore" value={material.supplierCode} onChange={e => setDraft({ ...catalog, materials: catalog.materials.map(m => m.id === material.id ? { ...m, supplierCode: e.target.value } : m) })} /></div>)}
    </details>}
    <div className="sticky bottom-0 z-10 border-t bg-background py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!draft || busy} onClick={save}>{busy ? 'Salvataggio…' : 'Salva catalogo'}</Button>
        {draft && <Button variant="ghost" disabled={busy} onClick={() => { setDraft(null); setEditingId(null); setMessage('Modifiche non salvate annullate.'); }}>Annulla modifiche</Button>}
        <span className="text-sm text-muted-foreground">{draft ? 'Modifiche non ancora salvate' : catalog ? 'Catalogo salvato' : ''}</span>
      </div>
      <p role="status" className="text-sm">{message}</p>
    </div>
  </div>;
}

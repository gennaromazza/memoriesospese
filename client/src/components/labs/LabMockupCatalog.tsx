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
      queryClient.setQueryData([base], saved); setDraft(null);
      setMessage('Catalogo salvato. Le proposte già pubblicate non sono state cambiate.');
    }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4">
    <p className="text-sm">Nomi e campionario del laboratorio. Scegli il modello 3D corrispondente al prodotto: Custodia oppure Album girevole.</p>
    {query.isError && <p role="alert">Impossibile caricare il catalogo.</p>}
    {catalog?.models.map(model => <fieldset key={model.id} disabled={busy} className="border rounded p-3 space-y-3">
      <label className="block">Nome mostrato al cliente<Input maxLength={100} value={model.name} onChange={e => update(model.id, { name: e.target.value })} /></label>
      <label className="block">Codice modello del fornitore<Input maxLength={100} value={model.supplierCode} onChange={e => update(model.id, { supplierCode: e.target.value })} /></label>
      <label className="block">Modello 3D<select aria-label="Modello 3D" className="block border rounded p-2 w-full" value={model.rendererId || ''} onChange={e => update(model.id, { rendererId: MOCKUP_RENDERERS.find(r => r.id === e.target.value)?.id || null, materialIds: e.target.value && !model.materialIds.length ? catalog.materials.map(m => m.id) : model.materialIds })}><option value="">Da integrare — non proponibile al cliente</option>{MOCKUP_RENDERERS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={model.active} onChange={e => update(model.id, { active: e.target.checked })} />Disponibile nel catalogo</label>
      {model.rendererId && <details><summary className="cursor-pointer">Rivestimenti compatibili del laboratorio ({model.materialIds.length})</summary>
        {!catalog.materials.length && <p>Importa prima il campionario qui sotto.</p>}
        {catalog.materials.map(material => <label key={material.id} className="flex gap-2 py-1"><input type="checkbox" checked={model.materialIds.includes(material.id)} onChange={e => update(model.id, { materialIds: e.target.checked ? [...model.materialIds, material.id] : model.materialIds.filter(id => id !== material.id) })} />{material.label}</label>)}
      </details>}
    </fieldset>)}
    {catalog && <details className="border rounded p-3"><summary className="cursor-pointer">Campionario del laboratorio ({catalog.materials.length})</summary>
      <p className="text-xs my-2">Nomi e codici sono comuni ai modelli di questo laboratorio. Importa Custodia solo nell’anagrafica del suo fornitore reale.</p>
      <Button variant="outline" disabled={busy} onClick={importMaterials}>Importa campionario Custodia / Peppe Lab</Button>
      {catalog.materials.map(material => <div key={material.id} className="grid sm:grid-cols-2 gap-2 py-2"><Input disabled={busy} aria-label={`Nome ${material.label}`} maxLength={100} value={material.label} onChange={e => setDraft({ ...catalog, materials: catalog.materials.map(m => m.id === material.id ? { ...m, label: e.target.value } : m) })} /><Input disabled={busy} aria-label={`Codice fornitore ${material.label}`} maxLength={100} placeholder="Codice fornitore" value={material.supplierCode} onChange={e => setDraft({ ...catalog, materials: catalog.materials.map(m => m.id === material.id ? { ...m, supplierCode: e.target.value } : m) })} /></div>)}
    </details>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={!catalog || busy || catalog.models.length >= 50} onClick={() => catalog && setDraft({ ...catalog, models: [...catalog.models, { id: crypto.randomUUID(), name: '', supplierCode: '', rendererId: null, active: true, materialIds: [] }] })}>Aggiungi modello</Button>
      <Button disabled={!draft || busy} onClick={save}>Salva catalogo</Button>
    </div><p role="status" className="text-sm">{message}</p>
  </div>;
}

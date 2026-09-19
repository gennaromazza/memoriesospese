import { I_NOBILI_MATERIALS } from '../shared/i-nobili-catalog.js';
import express from 'express';
import { db } from './firebase-admin.js';
import { catalogAllowedForLab, visibleCatalogForLab, isNobiliLab, labMockupCatalogSchema, mockupIdSchema } from '../shared/mockup-workflow.js';

/** Il chiamante applica autenticazione e autorizzazione amministrativa. */
export const labMockupCatalogRouter = express.Router({ mergeParams: true });
labMockupCatalogRouter.get('/', async (req: express.Request<{ labId: string }>, res) => {
  const id = mockupIdSchema.safeParse(req.params.labId);
  if (!id.success) return res.status(400).json({ error: 'Laboratorio non valido' });
  try {
    const lab = await db.collection('labs').doc(id.data).get();
    if (!lab.exists) return res.status(404).json({ error: 'Laboratorio non trovato' });
    res.json(visibleCatalogForLab(lab.data()!.mockupCatalog || { revision: 0, models: [], materials: [] }, lab.data()?.nome));
  } catch { res.status(500).json({ error: 'Impossibile leggere il catalogo' }); }
});
labMockupCatalogRouter.put('/', async (req: express.Request<{ labId: string }>, res) => {
  const id = mockupIdSchema.safeParse(req.params.labId);
  const parsed = labMockupCatalogSchema.safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: 'Catalogo non valido: controlla nomi, modelli e rivestimenti' });
  try {
    const result = await db.runTransaction(async tx => {
      const ref = db.collection('labs').doc(id.data);
      const lab = await tx.get(ref);
      if (!lab.exists) return null;
      if (!catalogAllowedForLab(parsed.data, lab.data()?.nome)) return 'wrong-lab';
      if ((lab.data()!.mockupCatalog?.revision || 0) !== parsed.data.revision) return false;
      const catalog = { ...parsed.data, revision: parsed.data.revision + 1 };
      tx.update(ref, { mockupCatalog: catalog });
      return catalog;
    });
    if (result === 'wrong-lab') return res.status(400).json({ error: 'Plaza LED e il campionario i Nobili sono riservati a i Nobili' });
    if (result === null) return res.status(404).json({ error: 'Laboratorio non trovato' });
    if (result === false) return res.status(409).json({ error: 'Catalogo modificato in un’altra sessione: riaprilo prima di salvare' });
    res.json(result);
  } catch { res.status(500).json({ error: 'Impossibile salvare il catalogo' }); }
});

// Idempotent, scoped import; retains all other material and model records.
labMockupCatalogRouter.post('/import-i-nobili', async (req: express.Request<{ labId: string }>, res) => {
  const id = mockupIdSchema.safeParse(req.params.labId);
  if (!id.success) return res.status(400).json({ error: 'Laboratorio non valido' });
  try {
    const result = await db.runTransaction(async tx => {
      const ref = db.collection('labs').doc(id.data), lab = await tx.get(ref);
      if (!lab.exists || !isNobiliLab(lab.data()?.nome)) return null;
      const current = labMockupCatalogSchema.parse(lab.data()?.mockupCatalog || { revision: 0, materials: [], models: [] });
      const materials = [...current.materials];
      for (const { id, label, supplierCode } of I_NOBILI_MATERIALS) {
        const index = materials.findIndex(m => m.id === id);
        if (index < 0) materials.push({ id, label, supplierCode });
        else materials[index] = { id, label, supplierCode };
      }
      const materialIds = I_NOBILI_MATERIALS.map(m => m.id);
      const models = current.models.map(m => m.rendererId === 'plaza-led' ? { ...m, materialIds } : m);
      if (!models.some(m => m.rendererId === 'plaza-led')) models.push({ id: 'dbe35c5b-314c-552b-921c-c83bc2f645ea', name: 'Plaza LED', supplierCode: '', rendererId: 'plaza-led', active: true, materialIds });
      const next = labMockupCatalogSchema.parse({ revision: current.revision, materials, models });
      if (JSON.stringify(next) !== JSON.stringify(current)) { next.revision++; tx.update(ref, { mockupCatalog: next }); }
      return next;
    });
    if (!result) return res.status(400).json({ error: 'Seleziona il laboratorio i Nobili' });
    res.json(result);
  } catch { res.status(500).json({ error: 'Importazione i Nobili non riuscita' }); }
});

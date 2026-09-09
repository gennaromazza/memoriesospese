import express from 'express';
import { db } from './firebase-admin.js';
import { labMockupCatalogSchema, mockupIdSchema } from '../shared/mockup-workflow.js';

/** Il chiamante applica autenticazione e autorizzazione amministrativa. */
export const labMockupCatalogRouter = express.Router({ mergeParams: true });
labMockupCatalogRouter.get('/', async (req: express.Request<{ labId: string }>, res) => {
  const id = mockupIdSchema.safeParse(req.params.labId);
  if (!id.success) return res.status(400).json({ error: 'Laboratorio non valido' });
  try {
    const lab = await db.collection('labs').doc(id.data).get();
    if (!lab.exists) return res.status(404).json({ error: 'Laboratorio non trovato' });
    res.json(lab.data()!.mockupCatalog || { revision: 0, models: [], materials: [] });
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
      if ((lab.data()!.mockupCatalog?.revision || 0) !== parsed.data.revision) return false;
      const catalog = { ...parsed.data, revision: parsed.data.revision + 1 };
      tx.update(ref, { mockupCatalog: catalog });
      return catalog;
    });
    if (result === null) return res.status(404).json({ error: 'Laboratorio non trovato' });
    if (result === false) return res.status(409).json({ error: 'Catalogo modificato in un’altra sessione: riaprilo prima di salvare' });
    res.json(result);
  } catch { res.status(500).json({ error: 'Impossibile salvare il catalogo' }); }
});

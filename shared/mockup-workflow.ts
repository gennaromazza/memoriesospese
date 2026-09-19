import { I_NOBILI_MATERIALS } from './i-nobili-catalog';
import { z } from 'zod';
import { MOCKUP_MODEL, PLAZA_MOCKUP_MODEL, ROTATING_MOCKUP_MODEL } from './mockup-catalog';

export const mockupIdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const materialSchema = z.object({
  id: z.string().uuid().refine(id => [...MOCKUP_MODEL.variants, ...PLAZA_MOCKUP_MODEL.variants].some(v => v.id === id)),
  label: z.string().trim().min(1).max(100),
  supplierCode: z.string().trim().max(100),
}).strict();
export const labMockupModelSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(100),
  supplierCode: z.string().trim().max(100),
  rendererId: z.union([z.literal(MOCKUP_MODEL.id), z.literal(ROTATING_MOCKUP_MODEL.id), z.literal(PLAZA_MOCKUP_MODEL.id)]).nullable(),
  active: z.boolean(),
  materialIds: z.array(z.string().uuid()).max(200).refine(items => new Set(items).size === items.length),
}).strict().refine(model => !model.rendererId || model.materialIds.length > 0, 'Seleziona almeno un rivestimento');
export const labMockupCatalogSchema = z.object({
  revision: z.number().int().min(0),
  materials: z.array(materialSchema).max(200).refine(items => new Set(items.map(i => i.id)).size === items.length),
  models: z.array(labMockupModelSchema).max(50).refine(items => new Set(items.map(i => i.id)).size === items.length),
}).strict().refine(catalog => catalog.models.every(model => model.materialIds.every(id => catalog.materials.some(m => m.id === id))), 'Rivestimento non presente nel laboratorio').refine(catalog => catalog.models.every(model => model.materialIds.every(id => materialFitsRenderer(model.rendererId, id))), 'Rivestimento incompatibile con il modello 3D');
export type LabMockupModel = z.infer<typeof labMockupModelSchema>;
export type LabMockupCatalog = z.infer<typeof labMockupCatalogSchema>;
export interface MockupOption extends LabMockupModel { labId: string; labName: string; materials: z.infer<typeof materialSchema>[] }
export type MockupOfferMode = 'fixed' | 'choice';
export interface MockupOffer { revision: number; options: MockupOption[]; updatedAt: string; mode?: MockupOfferMode }
export type MockupStatus = 'draft' | 'submitted' | 'changes_requested' | 'confirmed';
export const MOCKUP_STATUS_LABELS: Record<MockupStatus, string> = {
  draft: 'Bozza', submitted: 'Da verificare', changes_requested: 'Modifiche richieste', confirmed: 'Confermato dallo studio',
};
export interface MockupSelection { labId: string; modelId: string }
export const mockupSelectionSchema = z.object({ labId: mockupIdSchema, modelId: z.string().uuid() }).strict();
export const mockupOfferInputSchema = z.object({
  revision: z.number().int().min(0),
  savedRevision: z.number().int().min(0),
  mode: z.enum(['fixed', 'choice']).default('choice'),
  selections: z.array(mockupSelectionSchema).min(1).max(100).refine(items => new Set(items.map(i => `${i.labId}/${i.modelId}`)).size === items.length),
}).strict().refine(input => input.mode !== 'fixed' || input.selections.length === 1, 'Il modello unico richiede una sola scelta');
export const mockupWorkflowInputSchema = z.object({ revision: z.number().int().min(1), note: z.string().trim().max(2000).default('') }).strict();

export function optionFor(offer: MockupOffer | null, selection?: MockupSelection): MockupOption | undefined {
  return offer?.options.find(o => o.labId === selection?.labId && o.id === selection?.modelId);
}

/** Both C frames must use materials offered by the selected laboratory. */
export function optionAllowsMaterials(option: MockupOption, configuration: { materialId: string; innerMaterialId?: string }): boolean {
  if ((option.rendererId === 'plaza-led' || [configuration.materialId, configuration.innerMaterialId].some(id => id && isNobiliMaterial(id))) && !isNobiliLab(option.labName)) return false;
  return [configuration.materialId, configuration.innerMaterialId].filter(Boolean).every(id => option.materials.some(m => m.id === id));
}
export const isNobiliLab = (name: unknown) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === 'inobili';

const nobiliMaterialIds = new Set<string>(I_NOBILI_MATERIALS.map(m => m.id));
export const isNobiliMaterial = (id: string) => nobiliMaterialIds.has(id);
export function materialFitsRenderer(rendererId: string | null, id: string): boolean {
  if (!rendererId) return true;
  const model = [MOCKUP_MODEL, ROTATING_MOCKUP_MODEL, PLAZA_MOCKUP_MODEL].find(m => m.id === rendererId);
  return !!model?.variants.some(v => v.id === id);
}
export function catalogAllowedForLab(catalog: LabMockupCatalog, name: unknown): boolean {
  return isNobiliLab(name) || (!catalog.materials.some(m => isNobiliMaterial(m.id)) && !catalog.models.some(m => m.rendererId === 'plaza-led'));
}
/** Presentation filter for legacy catalogs; does not rewrite historical orders. */
export function visibleCatalogForLab(catalog: LabMockupCatalog, name: unknown): LabMockupCatalog {
  const materials = catalog.materials.filter(m => isNobiliLab(name) || !isNobiliMaterial(m.id));
  const ids = new Set(materials.map(m => m.id));
  const models = catalog.models.filter(m => m.rendererId !== 'plaza-led' || isNobiliLab(name)).map(m => ({ ...m, materialIds: m.materialIds.filter(id => ids.has(id) && materialFitsRenderer(m.rendererId, id)) }));
  return { ...catalog, materials, models };
}

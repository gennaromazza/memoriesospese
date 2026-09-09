import { z } from 'zod';
import { MOCKUP_MODEL, ROTATING_MOCKUP_MODEL } from './mockup-catalog';

export const mockupIdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const materialSchema = z.object({
  id: z.string().uuid().refine(id => MOCKUP_MODEL.variants.some(v => v.id === id)),
  label: z.string().trim().min(1).max(100),
  supplierCode: z.string().trim().max(100),
}).strict();
export const labMockupModelSchema = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(100),
  supplierCode: z.string().trim().max(100),
  rendererId: z.union([z.literal(MOCKUP_MODEL.id), z.literal(ROTATING_MOCKUP_MODEL.id)]).nullable(),
  active: z.boolean(),
  materialIds: z.array(z.string().uuid()).max(37).refine(items => new Set(items).size === items.length),
}).strict().refine(model => !model.rendererId || model.materialIds.length > 0, 'Seleziona almeno un rivestimento');
export const labMockupCatalogSchema = z.object({
  revision: z.number().int().min(0),
  materials: z.array(materialSchema).max(37).refine(items => new Set(items.map(i => i.id)).size === items.length),
  models: z.array(labMockupModelSchema).max(50).refine(items => new Set(items.map(i => i.id)).size === items.length),
}).strict().refine(catalog => catalog.models.every(model => model.materialIds.every(id => catalog.materials.some(m => m.id === id))), 'Rivestimento non presente nel laboratorio');
export type LabMockupModel = z.infer<typeof labMockupModelSchema>;
export type LabMockupCatalog = z.infer<typeof labMockupCatalogSchema>;
export interface MockupOption extends LabMockupModel { labId: string; labName: string; materials: z.infer<typeof materialSchema>[] }
export interface MockupOffer { revision: number; options: MockupOption[]; updatedAt: string }
export type MockupStatus = 'draft' | 'submitted' | 'changes_requested' | 'confirmed';
export const MOCKUP_STATUS_LABELS: Record<MockupStatus, string> = {
  draft: 'Bozza', submitted: 'Da verificare', changes_requested: 'Modifiche richieste', confirmed: 'Confermato dallo studio',
};
export interface MockupSelection { labId: string; modelId: string }
export const mockupSelectionSchema = z.object({ labId: mockupIdSchema, modelId: z.string().uuid() }).strict();
export const mockupOfferInputSchema = z.object({
  revision: z.number().int().min(0),
  savedRevision: z.number().int().min(0),
  selections: z.array(mockupSelectionSchema).min(1).max(100).refine(items => new Set(items.map(i => `${i.labId}/${i.modelId}`)).size === items.length),
}).strict();
export const mockupWorkflowInputSchema = z.object({ revision: z.number().int().min(1), note: z.string().trim().max(2000).default('') }).strict();

export function optionFor(offer: MockupOffer | null, selection?: MockupSelection): MockupOption | undefined {
  return offer?.options.find(o => o.labId === selection?.labId && o.id === selection?.modelId);
}

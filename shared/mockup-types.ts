import { z } from 'zod';
import { MOCKUP_MODEL, ROTATING_MOCKUP_MODEL } from './mockup-catalog';
import type { MockupOffer, MockupOption, MockupSelection, MockupStatus } from './mockup-workflow';

const custodiaConfigurationSchema = z.object({
  modelId: z.literal(MOCKUP_MODEL.id),
  assetRevision: z.literal(MOCKUP_MODEL.assetRevision),
  materialId: z.string().refine(id => MOCKUP_MODEL.variants.some(v => v.id === id), 'Rivestimento non disponibile'),
  appearanceRevision: z.number().int(),
  coverLayout: z.enum(['oblique', 'full']),
  topText: z.string().max(50),
  bottomText: z.string().max(50),
  photoAssetId: z.string().uuid(),
  crop: z.object({ zoom: z.number().min(1).max(3), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
}).strict().refine(c => MOCKUP_MODEL.variants.some(v => v.id === c.materialId && v.appearanceRevision === c.appearanceRevision), 'Revisione del rivestimento non disponibile');

const rotatingConfigurationBase = z.object({
  modelId: z.literal(ROTATING_MOCKUP_MODEL.id), assetRevision: z.literal(1),
  materialId: z.string(), appearanceRevision: z.number().int(),
  coverLayout: z.enum(['full', 'plaque', 'photo-plaque']),
  frameFinish: z.enum(['wood', 'white', 'fabric']),
  topText: z.string().max(50), bottomText: z.string().max(50),
  photoAssetId: z.string().uuid().nullable(),
  crop: z.object({ zoom: z.number().min(1).max(3), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
}).strict();
const rotatingConfigurationSchema = rotatingConfigurationBase.refine(c => MOCKUP_MODEL.variants.some(v => v.id === c.materialId && v.appearanceRevision === c.appearanceRevision), 'Revisione del rivestimento non disponibile')
  .refine(c => c.coverLayout === 'plaque' || !!c.photoAssetId, 'Seleziona una foto per questa copertina');
const rotatingPlexConfigurationBase = rotatingConfigurationBase.extend({
  assetRevision: z.literal(2),
  backCover: z.enum(['fabric', 'photo']),
  backPhotoAssetId: z.string().uuid().nullable(),
  backCrop: z.object({ zoom: z.number().min(1).max(3), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
}).strict();
const rotatingPlexConfigurationSchema = rotatingPlexConfigurationBase.refine(c => MOCKUP_MODEL.variants.some(v => v.id === c.materialId && v.appearanceRevision === c.appearanceRevision), 'Revisione del rivestimento non disponibile')
  .refine(c => c.coverLayout === 'plaque' || !!c.photoAssetId, 'Seleziona una foto per questa copertina')
  .refine(c => c.backCover === 'fabric' || !!c.backPhotoAssetId, 'Seleziona una foto per il retro in plexiglass');
const rotatingMonogramConfigurationSchema = rotatingPlexConfigurationBase.extend({
  assetRevision: z.literal(3),
  engravingNames: z.object({ first: z.string().trim().max(50), second: z.string().trim().max(50) }).strict(),
}).strict().refine(c => MOCKUP_MODEL.variants.some(v => v.id === c.materialId && v.appearanceRevision === c.appearanceRevision), 'Revisione del rivestimento non disponibile')
  .refine(c => c.coverLayout === 'plaque' || !!c.photoAssetId, 'Seleziona una foto per questa copertina')
  .refine(c => c.backCover === 'fabric' || !!c.backPhotoAssetId, 'Seleziona una foto per il retro in plexiglass');
// Revisione 4: la foto è stampata sul plexiglass dello scrigno rotante, non sul libro.
// Il valore storico `fabric` indica la lastra trasparente, con il tessuto dell'album visibile.
// Le due forme conservano anche le incisioni a righe precedenti senza inventare nomi.
const rotatingBoxConfigurationBase = rotatingPlexConfigurationBase.extend({ assetRevision: z.literal(4) }).strict();
const rotatingBoxConfigurationSchema = z.union([
  rotatingBoxConfigurationBase,
  rotatingBoxConfigurationBase.extend({ engravingNames: z.object({ first: z.string().trim().max(50), second: z.string().trim().max(50) }).strict() }).strict(),
]).refine(c => MOCKUP_MODEL.variants.some(v => v.id === c.materialId && v.appearanceRevision === c.appearanceRevision), 'Revisione del rivestimento non disponibile')
  .refine(c => c.coverLayout === 'plaque' || !!c.photoAssetId, 'Seleziona una foto per questa copertina')
  .refine(c => c.backCover === 'fabric' || !!c.backPhotoAssetId, 'Seleziona una foto per il plexiglass dello scrigno');
export const mockupConfigurationSchema = z.union([custodiaConfigurationSchema, rotatingConfigurationSchema, rotatingPlexConfigurationSchema, rotatingMonogramConfigurationSchema, rotatingBoxConfigurationSchema]);

export type MockupConfiguration = z.infer<typeof mockupConfigurationSchema>;
export interface MockupPhoto { id: string; name: string; source: 'upload' | 'gallery'; photoId?: string; width: number; height: number }
export interface SavedMockup {
  revision: number; version: number; configuration: MockupConfiguration; updatedAt: string;
  status?: MockupStatus; updatedBy?: 'studio' | 'client'; selection?: MockupSelection;
  option?: MockupOption; note?: string; confirmedAt?: string; reportPath?: string;
}
export interface MockupPayload { version: number; editable: boolean; enabled: boolean; approvalRequired?: boolean; saved: SavedMockup | null; offer?: MockupOffer | null }

export function mockupEditable(book: { locked?: boolean; currentVersion: number; approval?: { version: number } | null }, version: number): boolean {
  return !book.locked && version === book.currentVersion;
}

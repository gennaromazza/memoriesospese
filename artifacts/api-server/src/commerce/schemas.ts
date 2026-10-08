import { z } from 'zod/v4';
import { isValidCodiceFiscale } from '../../shared/fiscal-validation.js';

/** Indirizzo italiano come arriva dal browser (la validazione definitiva è `normalizePostalAddress`). */
export const postalAddressSchema = z.object({
  street: z.string().trim().min(1).max(160),
  houseNumber: z.string().trim().min(1).max(20),
  postalCode: z.string().trim().regex(/^\d{5}$/, 'Il CAP deve contenere 5 cifre'),
  city: z.string().trim().min(1).max(100),
  province: z.string().trim().regex(/^[A-Za-z]{2}$/, 'La provincia deve contenere 2 lettere').transform(value => value.toUpperCase()),
  country: z.literal('IT'),
}).strict();

export const billingDetailsSchema = z.object({
  fiscalCode: z.string().trim().transform(value => value.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().refine(isValidCodiceFiscale, 'Inserisci un codice fiscale italiano valido')),
  residenceAddress: postalAddressSchema,
}).strict();

export const customerSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
}).strict();

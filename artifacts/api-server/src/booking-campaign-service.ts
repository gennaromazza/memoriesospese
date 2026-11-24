import { z } from 'zod';
import { db, FieldValue, Timestamp } from './firebase-admin.js';

const campaignInputSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  code: z.string().trim().min(1).max(8).regex(/^[A-Za-z0-9]+$/),
  descrizione: z.string().optional(),
  dataInizio: z.string().datetime(),
  dataFine: z.string().datetime(),
  giorniAnticipoSlider: z.number().finite().optional(),
  bloccaPrenotazioniPrimaInizio: z.boolean().optional(),
  temaStagionale: z.string().nullable(),
  orarioApertura: z.string(),
  orarioPausaInizio: z.string(),
  orarioPausaFine: z.string(),
  orarioChiusura: z.string(),
  durataShootingMinuti: z.number().finite().positive(),
  excludedDays: z.array(z.number().int().min(0).max(6)).optional(),
  prodottiDisponibili: z.array(z.string()),
  // Approval and deposit defaults preserve the legacy booking flow.
  richiedeApprovazione: z.boolean().default(true),
  richiedeAcconto: z.boolean().default(false),
  emailPromemoriaAcconto: z.boolean().default(true),
  emailRecuperoAcconto: z.boolean().default(true),
  accontoImportoCentesimi: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  immagineSlider: z.string().optional(),
  immaginePaginaBooking: z.string().optional(),
  attiva: z.boolean(),
}).superRefine((campaign, context) => {
  if (campaign.richiedeAcconto && !campaign.accontoImportoCentesimi) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['accontoImportoCentesimi'],
      message: 'Un importo di acconto positivo in centesimi è obbligatorio.',
    });
  }
});

export class CampaignCodeConflictError extends Error {
  constructor() {
    super('Il codice campagna è già in uso. Generane uno nuovo.');
    this.name = 'CampaignCodeConflictError';
  }
}

/**
 * Tutte le nuove campagne vengono create dal server: la query transazionale
 * intercetta anche i documenti storici con ID casuale e campo `code`.
 */
export async function createBookingCampaign(input: unknown): Promise<string> {
  const parsed = campaignInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error('I dati della campagna non sono validi.');
  }

  const campaign = parsed.data;
  const code = campaign.code.trim();
  const dataInizio = new Date(campaign.dataInizio);
  const dataFine = new Date(campaign.dataFine);
  if (dataFine < dataInizio) {
    throw new Error('La data di fine deve essere successiva alla data di inizio.');
  }

  const campaignRef = db.collection('booking_campaigns').doc(code);
  await db.runTransaction(async transaction => {
    const matchingCampaigns = await transaction.get(
      db.collection('booking_campaigns').where('code', '==', code),
    );
    const campaignWithCodeAsId = await transaction.get(campaignRef);

    if (!matchingCampaigns.empty || campaignWithCodeAsId.exists) {
      throw new CampaignCodeConflictError();
    }

    transaction.create(campaignRef, {
      ...campaign,
      emailRecuperoAcconto: campaign.richiedeAcconto && campaign.emailRecuperoAcconto,
      ...(campaign.richiedeAcconto && campaign.emailRecuperoAcconto
        ? { recuperoAccontoAttivatoIl: FieldValue.serverTimestamp() } : {}),
      code,
      dataInizio: Timestamp.fromDate(dataInizio),
      dataFine: Timestamp.fromDate(dataFine),
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return code;
}

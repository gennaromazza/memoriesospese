
import express from 'express';
import { db } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { nanoid } from 'nanoid';
import { DateTime } from 'luxon';
import { sendGmailEmail, getStudioContactInfo, getSiteBaseUrl } from './email-routes.js';
import type {
  Collaboratore,
  InsertCollaboratore,
  UpdateCollaboratore,
  JobCollaboratoreAssignment,
  InsertJobCollaboratoreAssignment,
  CollaboratoreStats,
  CollaboratorPayment,
  CollaboratorPaymentType,
  PaymentMethod
} from '@shared/collaboratori-types';

const router = express.Router();

/**
 * Genera token univoco per dashboard collaboratore
 */
function generateCollaboratorToken(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15) +
         Date.now().toString(36);
}

/**
 * Invia email assegnazione lavoro a collaboratore
 */
async function sendCollaboratorAssignmentEmail(
  req: express.Request,
  collaboratoreId: string,
  jobId: string,
  ruolo: string,
  compenso: number,
  noteAdmin?: string
): Promise<void> {
  const collaboratoreDoc = await db.collection('collaboratori').doc(collaboratoreId).get();
  const jobDoc = await db.collection('jobs').doc(jobId).get();
  
  if (!collaboratoreDoc.exists || !jobDoc.exists) {
    console.log('⚠️ Collaboratore o job non trovato, email non inviata');
    return;
  }
  
  let collaboratore = collaboratoreDoc.data();
  const job = jobDoc.data();
  
  if (!collaboratore?.email) {
    console.log('⚠️ Email collaboratore mancante, email non inviata');
    return;
  }

  // Se il collaboratore ha hasAccess ma non ha dashboardToken, genera e salva
  if (collaboratore.hasAccess && !collaboratore.dashboardToken) {
    const newToken = generateCollaboratorToken();
    await db.collection('collaboratori').doc(collaboratoreId).update({
      dashboardToken: newToken,
      updatedAt: Timestamp.now()
    });
    collaboratore = { ...collaboratore, dashboardToken: newToken };
    console.log(`🔑 Token generato per collaboratore esistente: ${collaboratoreId}`);
  }

  const studioInfo = await getStudioContactInfo();
  const siteUrl = getSiteBaseUrl(req);
  
  const ruoliLabels: Record<string, string> = {
    fotografo_secondario: 'Fotografo Secondario',
    videomaker: 'Videomaker',
    assistente: 'Assistente',
    photo_editor: 'Photo Editor',
    album_designer: 'Album Designer',
    altro: 'Altro'
  };

  const ruoloLabel = ruoliLabels[ruolo] || ruolo || 'Collaboratore';
  const compensoFormatted = compenso ? `€${compenso.toLocaleString('it-IT')}` : 'Da definire';
  const jobNome = job?.nomeEvento || 'Lavoro';
  const dataFormatted = job?.eventDate 
    ? new Date(job.eventDate.toDate()).toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }) 
    : 'Data da confermare';
  
  // Mostra link dashboard solo se hasAccess è true E il token esiste
  const dashboardUrl = (collaboratore?.hasAccess && collaboratore?.dashboardToken)
    ? `${siteUrl}/collaboratori/dashboard/${collaboratore.dashboardToken}`
    : null;

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #8b5a3c 0%, #6b4a2c 100%); padding: 30px 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
          Nuovo Lavoro Assegnato
        </h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">
          ${studioInfo.name}
        </p>
      </div>
      
      <div style="padding: 30px 25px;">
        <p style="font-size: 18px; color: #333; margin: 0 0 25px 0;">
          Ciao <strong style="color: #8b5a3c;">${collaboratore.nome} ${collaboratore.cognome}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
          Ti è stato assegnato un nuovo lavoro. Di seguito trovi tutti i dettagli:
        </p>
        
        <div style="background: #f8f5f2; border-radius: 12px; padding: 25px; margin-bottom: 25px; border-left: 4px solid #8b5a3c;">
          <h2 style="color: #8b5a3c; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">
            ${jobNome}
          </h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 120px;">Data:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${dataFormatted}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Ruolo:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${ruoloLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Compenso:</td>
              <td style="padding: 8px 0; color: #28a745; font-size: 14px; font-weight: 600;">${compensoFormatted}</td>
            </tr>
            ${noteAdmin ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">Note:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px;">${noteAdmin}</td>
            </tr>
            ` : ''}
          </table>
        </div>
        
        ${dashboardUrl ? `
        <div style="background: #e8f4f8; border-radius: 12px; padding: 25px; margin-bottom: 25px; text-align: center;">
          <p style="font-size: 16px; color: #333; margin: 0 0 20px 0;">
            <strong>Accedi alla tua dashboard</strong> per accettare o rifiutare questo lavoro:
          </p>
          
          <a href="${dashboardUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #8b5a3c 0%, #a06b4c 100%); 
                    color: #ffffff; padding: 16px 40px; text-decoration: none; 
                    border-radius: 8px; font-weight: 600; font-size: 16px;
                    box-shadow: 0 4px 15px rgba(139, 90, 60, 0.3);">
            Vai alla Dashboard
          </a>
        </div>
        ` : `
        <div style="background: #fff3cd; border-radius: 8px; padding: 15px; margin-bottom: 25px;">
          <p style="font-size: 14px; color: #856404; margin: 0;">
            Per accettare o rifiutare questo lavoro, contatta direttamente lo studio.
          </p>
        </div>
        `}
        
        <p style="font-size: 14px; color: #666; margin: 25px 0 0 0;">
          Grazie per la collaborazione!<br>
          <strong style="color: #8b5a3c;">${studioInfo.name}</strong>
        </p>
      </div>
      
      <div style="background: #f5f5f5; padding: 20px 25px; text-align: center; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #333;">${studioInfo.name}</p>
        <p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">${studioInfo.email}</p>
        <p style="margin: 0; font-size: 12px; color: #666;">${studioInfo.phone}</p>
      </div>
    </div>
  `;

  await sendGmailEmail(
    collaboratore.email,
    `Nuovo Lavoro Assegnato: ${jobNome} | ${studioInfo.name}`,
    htmlContent
  );
  
  console.log(`✅ Email assegnazione inviata a ${collaboratore.email}`);
}

/**
 * Invia email benvenuto a nuovo collaboratore
 */
async function sendCollaboratorWelcomeEmail(
  req: express.Request,
  collaboratore: any
): Promise<void> {
  if (!collaboratore?.email) {
    console.log('⚠️ Email collaboratore mancante, email benvenuto non inviata');
    return;
  }

  const studioInfo = await getStudioContactInfo();
  const siteUrl = getSiteBaseUrl(req);
  
  const ruoliLabels: Record<string, string> = {
    fotografo_secondario: 'Fotografo Secondario',
    videomaker: 'Videomaker',
    assistente: 'Assistente',
    photo_editor: 'Photo Editor',
    album_designer: 'Album Designer',
    altro: 'Altro'
  };

  const ruoloLabel = ruoliLabels[collaboratore.ruolo] || collaboratore.ruolo || 'Collaboratore';
  
  const dashboardUrl = collaboratore?.dashboardToken 
    ? `${siteUrl}/collaboratori/dashboard/${collaboratore.dashboardToken}`
    : null;

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #8b5a3c 0%, #6b4a2c 100%); padding: 30px 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
          Benvenuto nel Team!
        </h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">
          ${studioInfo.name}
        </p>
      </div>
      
      <div style="padding: 30px 25px;">
        <p style="font-size: 18px; color: #333; margin: 0 0 25px 0;">
          Ciao <strong style="color: #8b5a3c;">${collaboratore.nome} ${collaboratore.cognome}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
          Sei stato aggiunto come collaboratore presso <strong>${studioInfo.name}</strong>.
          Siamo felici di averti nel nostro team!
        </p>
        
        <div style="background: #f8f5f2; border-radius: 12px; padding: 25px; margin-bottom: 25px; border-left: 4px solid #8b5a3c;">
          <h2 style="color: #8b5a3c; margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">
            I tuoi dati
          </h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 120px;">Ruolo:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${ruoloLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Email:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px;">${collaboratore.email}</td>
            </tr>
            ${collaboratore.tariffaOraria ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Tariffa oraria:</td>
              <td style="padding: 8px 0; color: #28a745; font-size: 14px; font-weight: 600;">€${collaboratore.tariffaOraria}/h</td>
            </tr>
            ` : ''}
            ${collaboratore.tariffaGiornaliera ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Tariffa giornaliera:</td>
              <td style="padding: 8px 0; color: #28a745; font-size: 14px; font-weight: 600;">€${collaboratore.tariffaGiornaliera}/gg</td>
            </tr>
            ` : ''}
          </table>
        </div>
        
        ${dashboardUrl ? `
        <div style="background: #e8f4f8; border-radius: 12px; padding: 25px; margin-bottom: 25px; text-align: center;">
          <p style="font-size: 16px; color: #333; margin: 0 0 20px 0;">
            <strong>La tua dashboard personale</strong><br>
            Qui potrai vedere i lavori assegnati, accettarli o rifiutarli:
          </p>
          
          <a href="${dashboardUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #8b5a3c 0%, #a06b4c 100%); 
                    color: #ffffff; padding: 16px 40px; text-decoration: none; 
                    border-radius: 8px; font-weight: 600; font-size: 16px;
                    box-shadow: 0 4px 15px rgba(139, 90, 60, 0.3);">
            Accedi alla Dashboard
          </a>
          
          <p style="font-size: 12px; color: #666; margin: 15px 0 0 0;">
            Conserva questo link per accedere alla tua area riservata
          </p>
        </div>
        ` : ''}
        
        <p style="font-size: 14px; color: #666; margin: 25px 0 0 0;">
          Se hai domande, non esitare a contattarci.<br><br>
          A presto!<br>
          <strong style="color: #8b5a3c;">${studioInfo.name}</strong>
        </p>
      </div>
      
      <div style="background: #f5f5f5; padding: 20px 25px; text-align: center; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #333;">${studioInfo.name}</p>
        <p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">${studioInfo.email}</p>
        <p style="margin: 0; font-size: 12px; color: #666;">${studioInfo.phone}</p>
      </div>
    </div>
  `;

  await sendGmailEmail(
    collaboratore.email,
    `Benvenuto nel Team | ${studioInfo.name}`,
    htmlContent
  );
  
  console.log(`✅ Email benvenuto inviata a ${collaboratore.email}`);
}

/**
 * Invia email notifica pagamento registrato
 */
async function sendPaymentRegisteredEmail(
  req: express.Request,
  collaboratore: any,
  jobNome: string,
  dataJob: string,
  importo: number,
  tipoPagamento: 'acconto' | 'saldo',
  metodoPagamento: string,
  totalePagato: number,
  saldoResiduo: number,
  note?: string
): Promise<void> {
  if (!collaboratore?.email) {
    console.log('⚠️ Email collaboratore mancante, email pagamento non inviata');
    return;
  }

  const studioInfo = await getStudioContactInfo();
  const siteUrl = getSiteBaseUrl(req);
  
  const dashboardUrl = (collaboratore?.hasAccess && collaboratore?.dashboardToken)
    ? `${siteUrl}/collaboratori/dashboard/${collaboratore.dashboardToken}`
    : null;

  const metodiLabels: Record<string, string> = {
    contante: 'Contante',
    carta: 'Carta',
    bonifico: 'Bonifico',
    paypal: 'PayPal',
    altro: 'Altro'
  };

  const metodoLabel = metodiLabels[metodoPagamento] || metodoPagamento;
  const tipoLabel = tipoPagamento === 'acconto' ? 'Acconto' : 'Saldo';
  const isComplete = saldoResiduo <= 0;

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #28a745 0%, #20963d 100%); padding: 30px 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
          Pagamento Registrato
        </h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">
          ${studioInfo.name}
        </p>
      </div>
      
      <div style="padding: 30px 25px;">
        <p style="font-size: 18px; color: #333; margin: 0 0 25px 0;">
          Ciao <strong style="color: #28a745;">${collaboratore.nome} ${collaboratore.cognome}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
          Ti confermiamo la registrazione di un pagamento per il seguente lavoro:
        </p>
        
        <div style="background: #f0fdf4; border-radius: 12px; padding: 25px; margin-bottom: 25px; border-left: 4px solid #28a745;">
          <h2 style="color: #28a745; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">
            ${jobNome}
          </h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 150px;">Data evento:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${dataJob}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Tipo:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${tipoLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Importo:</td>
              <td style="padding: 8px 0; color: #28a745; font-size: 18px; font-weight: 700;">+€${importo.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Metodo:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px;">${metodoLabel}</td>
            </tr>
            ${note ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">Note:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px;">${note}</td>
            </tr>
            ` : ''}
          </table>
        </div>
        
        <div style="background: ${isComplete ? '#dcfce7' : '#fef3c7'}; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 0; color: #666; font-size: 14px;">Totale ricevuto:</td>
              <td style="padding: 5px 0; color: #28a745; font-size: 14px; font-weight: 600; text-align: right;">€${totalePagato.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #666; font-size: 14px;">Saldo residuo:</td>
              <td style="padding: 5px 0; color: ${isComplete ? '#28a745' : '#f59e0b'}; font-size: 14px; font-weight: 600; text-align: right;">€${saldoResiduo.toFixed(2)}</td>
            </tr>
          </table>
          ${isComplete ? `
          <p style="margin: 15px 0 0 0; padding-top: 15px; border-top: 1px solid #bbf7d0; font-size: 14px; color: #166534; font-weight: 600; text-align: center;">
            Pagamento completato!
          </p>
          ` : ''}
        </div>
        
        ${dashboardUrl ? `
        <div style="background: #e8f4f8; border-radius: 12px; padding: 25px; margin-bottom: 25px; text-align: center;">
          <p style="font-size: 14px; color: #333; margin: 0 0 15px 0;">
            Visualizza tutti i dettagli nella tua dashboard:
          </p>
          
          <a href="${dashboardUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #28a745 0%, #20963d 100%); 
                    color: #ffffff; padding: 14px 35px; text-decoration: none; 
                    border-radius: 8px; font-weight: 600; font-size: 14px;">
            Vai alla Dashboard
          </a>
        </div>
        ` : ''}
        
        <p style="font-size: 14px; color: #666; margin: 25px 0 0 0;">
          Grazie per la collaborazione!<br>
          <strong style="color: #28a745;">${studioInfo.name}</strong>
        </p>
      </div>
      
      <div style="background: #f5f5f5; padding: 20px 25px; text-align: center; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #333;">${studioInfo.name}</p>
        <p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">${studioInfo.email}</p>
        <p style="margin: 0; font-size: 12px; color: #666;">${studioInfo.phone}</p>
      </div>
    </div>
  `;

  await sendGmailEmail(
    collaboratore.email,
    `Pagamento Registrato: ${jobNome} | ${studioInfo.name}`,
    htmlContent
  );
  
  console.log(`✅ Email pagamento registrato inviata a ${collaboratore.email}`);
}

/**
 * Invia email notifica pagamento eliminato
 */
async function sendPaymentDeletedEmail(
  req: express.Request,
  collaboratore: any,
  jobNome: string,
  dataJob: string,
  importoEliminato: number,
  tipoPagamento: 'acconto' | 'saldo',
  nuovoSaldoResiduo: number
): Promise<void> {
  if (!collaboratore?.email) {
    console.log('⚠️ Email collaboratore mancante, email eliminazione pagamento non inviata');
    return;
  }

  const studioInfo = await getStudioContactInfo();
  const siteUrl = getSiteBaseUrl(req);
  
  const dashboardUrl = (collaboratore?.hasAccess && collaboratore?.dashboardToken)
    ? `${siteUrl}/collaboratori/dashboard/${collaboratore.dashboardToken}`
    : null;

  const tipoLabel = tipoPagamento === 'acconto' ? 'Acconto' : 'Saldo';

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 30px 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
          Pagamento Rimosso
        </h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">
          ${studioInfo.name}
        </p>
      </div>
      
      <div style="padding: 30px 25px;">
        <p style="font-size: 18px; color: #333; margin: 0 0 25px 0;">
          Ciao <strong style="color: #dc2626;">${collaboratore.nome} ${collaboratore.cognome}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
          Ti informiamo che un pagamento relativo al seguente lavoro e stato rimosso:
        </p>
        
        <div style="background: #fef2f2; border-radius: 12px; padding: 25px; margin-bottom: 25px; border-left: 4px solid #dc2626;">
          <h2 style="color: #dc2626; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">
            ${jobNome}
          </h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 150px;">Data evento:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${dataJob}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Tipo rimosso:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${tipoLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Importo rimosso:</td>
              <td style="padding: 8px 0; color: #dc2626; font-size: 18px; font-weight: 700;">-€${importoEliminato.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Nuovo saldo residuo:</td>
              <td style="padding: 8px 0; color: #f59e0b; font-size: 14px; font-weight: 600;">€${nuovoSaldoResiduo.toFixed(2)}</td>
            </tr>
          </table>
        </div>
        
        ${dashboardUrl ? `
        <div style="background: #e8f4f8; border-radius: 12px; padding: 25px; margin-bottom: 25px; text-align: center;">
          <p style="font-size: 14px; color: #333; margin: 0 0 15px 0;">
            Visualizza tutti i dettagli nella tua dashboard:
          </p>
          
          <a href="${dashboardUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #8b5a3c 0%, #a06b4c 100%); 
                    color: #ffffff; padding: 14px 35px; text-decoration: none; 
                    border-radius: 8px; font-weight: 600; font-size: 14px;">
            Vai alla Dashboard
          </a>
        </div>
        ` : ''}
        
        <p style="font-size: 14px; color: #666; margin: 25px 0 0 0;">
          Per qualsiasi chiarimento, contattaci.<br>
          <strong style="color: #8b5a3c;">${studioInfo.name}</strong>
        </p>
      </div>
      
      <div style="background: #f5f5f5; padding: 20px 25px; text-align: center; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #333;">${studioInfo.name}</p>
        <p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">${studioInfo.email}</p>
        <p style="margin: 0; font-size: 12px; color: #666;">${studioInfo.phone}</p>
      </div>
    </div>
  `;

  await sendGmailEmail(
    collaboratore.email,
    `Pagamento Rimosso: ${jobNome} | ${studioInfo.name}`,
    htmlContent
  );
  
  console.log(`✅ Email pagamento rimosso inviata a ${collaboratore.email}`);
}

/**
 * Invia email notifica modifica compenso
 */
async function sendCompensoModificatoEmail(
  req: express.Request,
  collaboratore: any,
  jobNome: string,
  dataJob: string,
  vecchioCompenso: number,
  nuovoCompenso: number,
  noteModifica?: string
): Promise<void> {
  if (!collaboratore?.email) {
    console.log('⚠️ Email collaboratore mancante, email modifica compenso non inviata');
    return;
  }

  const studioInfo = await getStudioContactInfo();
  const siteUrl = getSiteBaseUrl(req);
  
  const dashboardUrl = (collaboratore?.hasAccess && collaboratore?.dashboardToken)
    ? `${siteUrl}/collaboratori/dashboard/${collaboratore.dashboardToken}`
    : null;

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 30px 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
          Aggiornamento Compenso
        </h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">
          ${studioInfo.name}
        </p>
      </div>
      
      <div style="padding: 30px 25px;">
        <p style="font-size: 18px; color: #333; margin: 0 0 25px 0;">
          Ciao <strong style="color: #2563eb;">${collaboratore.nome} ${collaboratore.cognome}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
          Il compenso per il seguente lavoro è stato aggiornato:
        </p>
        
        <div style="background: #f0f9ff; border-radius: 12px; padding: 25px; margin-bottom: 25px; border-left: 4px solid #2563eb;">
          <h2 style="color: #2563eb; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">
            ${jobNome}
          </h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 150px;">Data evento:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${dataJob}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Compenso precedente:</td>
              <td style="padding: 8px 0; color: #999; font-size: 14px; text-decoration: line-through;">€${vecchioCompenso.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Nuovo compenso:</td>
              <td style="padding: 8px 0; color: #28a745; font-size: 18px; font-weight: 700;">€${nuovoCompenso.toFixed(2)}</td>
            </tr>
            ${noteModifica ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">Note:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px;">${noteModifica}</td>
            </tr>
            ` : ''}
          </table>
        </div>
        
        ${dashboardUrl ? `
        <div style="background: #e8f4f8; border-radius: 12px; padding: 25px; margin-bottom: 25px; text-align: center;">
          <p style="font-size: 14px; color: #333; margin: 0 0 15px 0;">
            Visualizza tutti i dettagli nella tua dashboard:
          </p>
          
          <a href="${dashboardUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); 
                    color: #ffffff; padding: 14px 35px; text-decoration: none; 
                    border-radius: 8px; font-weight: 600; font-size: 14px;">
            Vai alla Dashboard
          </a>
        </div>
        ` : ''}
        
        <p style="font-size: 14px; color: #666; margin: 25px 0 0 0;">
          Grazie per la collaborazione!<br>
          <strong style="color: #2563eb;">${studioInfo.name}</strong>
        </p>
      </div>
      
      <div style="background: #f5f5f5; padding: 20px 25px; text-align: center; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #333;">${studioInfo.name}</p>
        <p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">${studioInfo.email}</p>
        <p style="margin: 0; font-size: 12px; color: #666;">${studioInfo.phone}</p>
      </div>
    </div>
  `;

  await sendGmailEmail(
    collaboratore.email,
    `Aggiornamento Compenso: ${jobNome} | ${studioInfo.name}`,
    htmlContent
  );
  
  console.log(`✅ Email modifica compenso inviata a ${collaboratore.email}`);
}

/**
 * GET /api/collaboratori
 * Ottieni tutti i collaboratori (con filtro opzionale per attivi)
 */
router.get('/collaboratori', async (req, res) => {
  try {
    const { attiviOnly } = req.query;
    
    // 🔧 Fix: where() deve venire prima di orderBy() per evitare errore Firestore
    let baseQuery = db.collection('collaboratori');
    
    if (attiviOnly === 'true') {
      baseQuery = baseQuery.where('attivo', '==', true);
    }
    
    const queryWithOrder = baseQuery.orderBy('cognome', 'asc');
    
    const snapshot = await queryWithOrder.get();
    const collaboratori = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(collaboratori);
  } catch (error: any) {
    console.error('❌ Error fetching collaboratori:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/:id
 * Ottieni un singolo collaboratore
 */
router.get('/collaboratori/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection('collaboratori').doc(id).get();
    
    if (!doc.exists) {
      return res.status(404).json({ error: 'Collaboratore non trovato' });
    }
    
    res.json({ id: doc.id, ...doc.data() });
  } catch (error: any) {
    console.error('❌ Error fetching collaboratore:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori
 * Crea nuovo collaboratore
 */
router.post('/collaboratori', async (req, res) => {
  try {
    const data: InsertCollaboratore = req.body;
    
    const collaboratoreData: any = {
      nome: data.nome,
      cognome: data.cognome,
      email: data.email.toLowerCase(),
      ruolo: data.ruolo,
      attivo: true,
      hasAccess: data.hasAccess || false,
      dashboardToken: generateCollaboratorToken(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    if (data.cellulare) collaboratoreData.cellulare = data.cellulare;
    if (data.tariffaOraria !== undefined) collaboratoreData.tariffaOraria = data.tariffaOraria;
    if (data.tariffaGiornaliera !== undefined) collaboratoreData.tariffaGiornaliera = data.tariffaGiornaliera;
    if (data.note) collaboratoreData.note = data.note;
    
    const docRef = await db.collection('collaboratori').add(collaboratoreData);
    const created = { id: docRef.id, ...collaboratoreData };
    
    // Invia email di benvenuto (fire-and-forget)
    sendCollaboratorWelcomeEmail(req, created)
      .catch(err => console.error('❌ Email benvenuto fallita (non bloccante):', err));
    
    res.json(created);
  } catch (error: any) {
    console.error('❌ Error creating collaboratore:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/collaboratori/:id
 * Aggiorna collaboratore
 */
router.patch('/collaboratori/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates: UpdateCollaboratore = req.body;
    
    // Recupera email precedente per confronto
    const existingDoc = await db.collection('collaboratori').doc(id).get();
    const existingData = existingDoc.data();
    const previousEmail = existingData?.email;
    
    const updateData: any = {
      ...updates,
      updatedAt: Timestamp.now()
    };
    
    if (updates.email) {
      updateData.email = updates.email.toLowerCase();
    }
    
    await db.collection('collaboratori').doc(id).update(updateData);
    
    const updated = await db.collection('collaboratori').doc(id).get();
    const updatedData = { id: updated.id, ...updated.data() };
    
    // Se l'email è cambiata, invia email di benvenuto al nuovo indirizzo
    if (updates.email && updates.email.toLowerCase() !== previousEmail?.toLowerCase()) {
      console.log(`📧 Email collaboratore modificata: ${previousEmail} → ${updates.email}`);
      sendCollaboratorWelcomeEmail(req, updatedData)
        .catch(err => console.error('❌ Email aggiornamento fallita (non bloccante):', err));
    }
    
    res.json(updatedData);
  } catch (error: any) {
    console.error('❌ Error updating collaboratore:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori/assign-to-job
 * Assegna collaboratore a job
 */
router.post('/collaboratori/assign-to-job', async (req, res) => {
  try {
    const data: InsertJobCollaboratoreAssignment = req.body;
    
    const assignmentData: Omit<JobCollaboratoreAssignment, 'id'> = {
      ...data,
      status: 'pending',
      dataRichiesta: Timestamp.now(),
      isPagato: false,
      pagamenti: [],
      saldoResiduo: data.compenso,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    const docRef = await db.collection('jobCollaboratoreAssignments').add(assignmentData);
    
    // Invia email notifica direttamente (fire-and-forget)
    sendCollaboratorAssignmentEmail(req, data.collaboratoreId, data.jobId, data.ruoloInJob, data.compenso, data.noteAdmin)
      .catch(err => console.error('❌ Email assegnazione fallita (non bloccante):', err));
    
    res.json({ id: docRef.id, ...assignmentData });
  } catch (error: any) {
    console.error('❌ Error assigning collaboratore:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/collaboratori/assignments/:id/products-tasks
 * Aggiorna prodotti e mansioni assegnate
 */
router.patch('/collaboratori/assignments/:id/products-tasks', async (req, res) => {
  try {
    const { id } = req.params;
    const { prodottiAssegnati, mansioniAssegnate } = req.body;
    
    const assignmentDoc = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    
    if (!assignmentDoc.exists) {
      return res.status(404).json({ error: 'Assegnazione non trovata' });
    }
    
    const updateData: any = {
      updatedAt: Timestamp.now()
    };
    
    if (prodottiAssegnati !== undefined) {
      updateData.prodottiAssegnati = prodottiAssegnati;
    }
    
    if (mansioniAssegnate !== undefined) {
      updateData.mansioniAssegnate = mansioniAssegnate;
    }
    
    await db.collection('jobCollaboratoreAssignments').doc(id).update(updateData);
    
    const updated = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    console.error('❌ Error updating assignment products/tasks:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/assignments/job/:jobId
 * Ottieni assegnazioni per job
 */
router.get('/collaboratori/assignments/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Rimosso orderBy per evitare requisito indice composto Firestore
    // Sort gestito lato client se necessario
    const snapshot = await db.collection('jobCollaboratoreAssignments')
      .where('jobId', '==', jobId)
      .get();
    
    const assignments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(assignments);
  } catch (error: any) {
    console.error('❌ Error fetching job assignments:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/assignments/collaboratore/:collaboratoreId
 * Ottieni assegnazioni per collaboratore
 */
router.get('/collaboratori/assignments/collaboratore/:collaboratoreId', async (req, res) => {
  try {
    const { collaboratoreId } = req.params;
    
    // Rimosso orderBy per evitare requisito indice composto Firestore
    // Sort gestito lato client se necessario
    const snapshot = await db.collection('jobCollaboratoreAssignments')
      .where('collaboratoreId', '==', collaboratoreId)
      .get();
    
    const assignments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.json(assignments);
  } catch (error: any) {
    console.error('❌ Error fetching collaboratore assignments:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/collaboratori/assignments/:id
 * Rimuovi assegnazione collaboratore e movimenti cassa associati
 */
router.delete('/collaboratori/assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const assignmentDoc = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    
    if (!assignmentDoc.exists) {
      return res.status(404).json({ error: 'Assegnazione non trovata' });
    }
    
    const assignment = assignmentDoc.data() as JobCollaboratoreAssignment;
    
    // Recupera dati collaboratore e job per notifica email
    const [collaboratoreDoc, jobDoc] = await Promise.all([
      db.collection('collaboratori').doc(assignment.collaboratoreId).get(),
      db.collection('jobs').doc(assignment.jobId).get()
    ]);
    
    const collaboratore = collaboratoreDoc.exists ? collaboratoreDoc.data() : null;
    const job = jobDoc.exists ? jobDoc.data() : null;
    const nomeJob = job?.nomeEvento || 'Lavoro';
    const totalePagamentiRimossi = assignment.pagamenti?.reduce((sum, p) => sum + p.importo, 0) || 0;
    
    // Elimina movimenti cassa associati ai pagamenti
    if (assignment.pagamenti && assignment.pagamenti.length > 0) {
      const cashMovementIds = assignment.pagamenti
        .map(p => p.cashMovementId)
        .filter((id): id is string => Boolean(id));
      
      if (cashMovementIds.length > 0) {
        const batch = db.batch();
        for (const cashMovementId of cashMovementIds) {
          batch.delete(db.collection('cashMovements').doc(cashMovementId));
        }
        await batch.commit();
        console.log(`🗑️ Eliminati ${cashMovementIds.length} movimenti cassa associati`);
      }
      
      // Invia email notifica eliminazione pagamenti (fire-and-forget)
      if (collaboratore && totalePagamentiRimossi > 0) {
        const dataJob = job?.eventDate 
          ? new Date(job.eventDate.toDate()).toLocaleDateString('it-IT', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            }) 
          : 'Data da confermare';
        
        sendPaymentDeletedEmail(
          req,
          { ...collaboratore, id: collaboratoreDoc.id },
          nomeJob,
          dataJob,
          totalePagamentiRimossi,
          'saldo',
          assignment.compenso
        ).catch(err => console.error('❌ Email eliminazione pagamenti fallita (non bloccante):', err));
      }
    }
    
    await db.collection('jobCollaboratoreAssignments').doc(id).delete();
    
    console.log(`🗑️ Assegnazione ${id} rimossa`);
    res.json({ success: true, message: 'Assegnazione rimossa' });
  } catch (error: any) {
    console.error('❌ Error deleting assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/collaboratori/assignments/:id/compenso
 * Modifica compenso assegnazione e notifica collaboratore
 */
router.patch('/collaboratori/assignments/:id/compenso', async (req, res) => {
  try {
    const { id } = req.params;
    const { compenso, noteModifica, sendEmail = true } = req.body;
    
    if (compenso === undefined || compenso < 0) {
      return res.status(400).json({ error: 'Compenso non valido' });
    }
    
    // Recupera assegnazione attuale
    const assignmentDoc = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    if (!assignmentDoc.exists) {
      return res.status(404).json({ error: 'Assegnazione non trovata' });
    }
    
    const assignment = assignmentDoc.data() as JobCollaboratoreAssignment;
    const vecchioCompenso = assignment.compenso || 0;
    
    // Ricalcola saldo residuo (minimo 0 per evitare valori negativi)
    const totalePagato = (assignment.pagamenti || []).reduce((sum, p) => sum + p.importo, 0);
    const nuovoSaldoResiduo = Math.max(0, compenso - totalePagato);
    const isPagato = compenso > 0 && nuovoSaldoResiduo <= 0;
    
    // Aggiorna assegnazione
    await db.collection('jobCollaboratoreAssignments').doc(id).update({
      compenso: compenso,
      saldoResiduo: nuovoSaldoResiduo,
      isPagato: isPagato,
      updatedAt: Timestamp.now()
    });
    
    // Invia email se richiesto e compenso è cambiato
    if (sendEmail && compenso !== vecchioCompenso) {
      const [collaboratoreDoc, jobDoc] = await Promise.all([
        db.collection('collaboratori').doc(assignment.collaboratoreId).get(),
        db.collection('jobs').doc(assignment.jobId).get()
      ]);
      
      const collaboratore = { id: collaboratoreDoc.id, ...collaboratoreDoc.data() };
      const job = jobDoc.data();
      
      const jobNome = job?.nomeEvento || 'Lavoro';
      const dataJob = job?.eventDate 
        ? new Date(job.eventDate.toDate()).toLocaleDateString('it-IT', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })
        : 'Data da confermare';
      
      sendCompensoModificatoEmail(req, collaboratore, jobNome, dataJob, vecchioCompenso, compenso, noteModifica)
        .catch(err => console.error('❌ Email modifica compenso fallita (non bloccante):', err));
    }
    
    const updated = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    console.error('❌ Error updating compenso:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori/:id/generate-token
 * Genera token dashboard per collaboratore esistente
 */
router.post('/collaboratori/:id/generate-token', async (req, res) => {
  try {
    const { id } = req.params;
    
    const collaboratoreDoc = await db.collection('collaboratori').doc(id).get();
    
    if (!collaboratoreDoc.exists) {
      return res.status(404).json({ error: 'Collaboratore non trovato' });
    }
    
    const newToken = generateCollaboratorToken();
    await db.collection('collaboratori').doc(id).update({
      dashboardToken: newToken,
      hasAccess: true,
      updatedAt: Timestamp.now()
    });
    
    console.log(`🔑 Token generato per collaboratore ${id}`);
    res.json({ dashboardToken: newToken });
  } catch (error: any) {
    console.error('❌ Error generating token:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/collaboratori/assignments/:id/respond
 * Rispondi a assegnazione (accetta/rifiuta)
 */
router.patch('/collaboratori/assignments/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, noteRifiuto } = req.body;
    
    const updateData: any = {
      status,
      dataRisposta: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    if (noteRifiuto) {
      updateData.noteRifiuto = noteRifiuto;
    }
    
    await db.collection('jobCollaboratoreAssignments').doc(id).update(updateData);
    
    const updated = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    console.error('❌ Error responding to assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/collaboratori/assignments/:id/mark-paid
 * Segna assegnazione come pagata
 */
router.patch('/collaboratori/assignments/:id/mark-paid', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.collection('jobCollaboratoreAssignments').doc(id).update({
      isPagato: true,
      dataPagamento: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    const updated = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    console.error('❌ Error marking assignment as paid:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/:id/stats
 * Ottieni statistiche collaboratore
 */
router.get('/collaboratori/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    
    const snapshot = await db.collection('jobCollaboratoreAssignments')
      .where('collaboratoreId', '==', id)
      .get();
    
    const assignments = snapshot.docs.map(doc => doc.data() as JobCollaboratoreAssignment);
    
    const stats: CollaboratoreStats = {
      totalJobs: assignments.length,
      jobsAccepted: assignments.filter(a => a.status === 'accepted').length,
      jobsDeclined: assignments.filter(a => a.status === 'declined').length,
      jobsPending: assignments.filter(a => a.status === 'pending').length,
      totalEarnings: assignments
        .filter(a => a.status === 'accepted')
        .reduce((sum, a) => sum + a.compenso, 0),
      earningsPaid: assignments
        .filter(a => a.status === 'accepted' && a.isPagato)
        .reduce((sum, a) => sum + a.compenso, 0),
      earningsPending: assignments
        .filter(a => a.status === 'accepted' && !a.isPagato)
        .reduce((sum, a) => sum + a.compenso, 0)
    };
    
    res.json(stats);
  } catch (error: any) {
    console.error('❌ Error fetching collaboratore stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/public/assignment/:id
 * Ottieni dettagli assegnazione (pubblico, per link email)
 */
router.get('/collaboratori/public/assignment/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const assignmentDoc = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    if (!assignmentDoc.exists) {
      return res.status(404).json({ error: 'Assegnazione non trovata' });
    }
    
    const assignment = assignmentDoc.data();
    
    // Recupera dati collaboratore e job
    const [collaboratoreDoc, jobDoc] = await Promise.all([
      db.collection('collaboratori').doc(assignment!.collaboratoreId).get(),
      db.collection('jobs').doc(assignment!.jobId).get()
    ]);
    
    res.json({
      id: assignmentDoc.id,
      ...assignment,
      collaboratore: collaboratoreDoc.exists ? collaboratoreDoc.data() : null,
      job: jobDoc.exists ? jobDoc.data() : null
    });
  } catch (error: any) {
    console.error('❌ Error fetching assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori/public/assignment/:id/accept
 * Accetta assegnazione (pubblico, da link email)
 */
router.post('/collaboratori/public/assignment/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.collection('jobCollaboratoreAssignments').doc(id).update({
      status: 'accepted',
      dataRisposta: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    res.json({ success: true, message: 'Assegnazione accettata' });
  } catch (error: any) {
    console.error('❌ Error accepting assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori/public/assignment/:id/decline
 * Rifiuta assegnazione (pubblico, da link email)
 */
router.post('/collaboratori/public/assignment/:id/decline', async (req, res) => {
  try {
    const { id } = req.params;
    const { noteRifiuto } = req.body;
    
    await db.collection('jobCollaboratoreAssignments').doc(id).update({
      status: 'declined',
      dataRisposta: Timestamp.now(),
      noteRifiuto: noteRifiuto || '',
      updatedAt: Timestamp.now()
    });
    
    res.json({ success: true, message: 'Assegnazione rifiutata' });
  } catch (error: any) {
    console.error('❌ Error declining assignment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori/assignments/:id/add-payment
 * Registra pagamento (acconto/saldo) per assegnazione collaboratore
 */
router.post('/collaboratori/assignments/:id/add-payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { importo, tipo, metodo, note, data } = req.body as {
      importo: number;
      tipo: CollaboratorPaymentType;
      metodo: PaymentMethod;
      note?: string;
      data?: string;
    };
    
    // Validazione input
    if (!importo || importo <= 0) {
      return res.status(400).json({ error: 'Importo non valido' });
    }
    if (!tipo || !['acconto', 'saldo'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo pagamento non valido' });
    }
    if (!metodo) {
      return res.status(400).json({ error: 'Metodo pagamento richiesto' });
    }
    
    // Recupera assegnazione
    const assignmentDoc = await db.collection('jobCollaboratoreAssignments').doc(id).get();
    if (!assignmentDoc.exists) {
      return res.status(404).json({ error: 'Assegnazione non trovata' });
    }
    const assignment = assignmentDoc.data() as JobCollaboratoreAssignment;
    
    // Recupera collaboratore e job per descrizione movimento cassa
    const [collaboratoreDoc, jobDoc] = await Promise.all([
      db.collection('collaboratori').doc(assignment.collaboratoreId).get(),
      db.collection('jobs').doc(assignment.jobId).get()
    ]);
    
    const collaboratore = collaboratoreDoc.data();
    const job = jobDoc.data();
    const nomeCollaboratore = `${collaboratore?.nome || ''} ${collaboratore?.cognome || ''}`.trim();
    const nomeJob = job?.nomeEvento || 'Lavoro senza nome';
    const ruolo = assignment.ruoloInJob;
    
    // Mappa ruoli per categoria
    const ruoliLabels: Record<string, string> = {
      fotografo_secondario: 'Fotografo Secondario',
      videomaker: 'Videomaker',
      assistente: 'Assistente',
      photo_editor: 'Photo Editor',
      album_designer: 'Album Designer',
      altro: 'Altro'
    };
    
    const categoriaMovimento = `Collaboratori - ${ruoliLabels[ruolo] || 'Altro'}`;
    const descrizioneMovimento = `Pagamento ${nomeCollaboratore} - ${nomeJob}`;
    
    // Crea movimento cassa (uscita)
    const cashMovementData = {
      tipo: 'uscita' as const,
      categoria: categoriaMovimento,
      importo: importo,
      descrizione: descrizioneMovimento,
      data: data ? Timestamp.fromDate(new Date(data)) : Timestamp.now(),
      metodoPagamento: metodo,
      note: note || null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    const cashMovementRef = await db.collection('cashMovements').add(cashMovementData);
    
    // Crea record pagamento per assegnazione
    const pagamento: Omit<CollaboratorPayment, 'data'> & { data: any } = {
      id: nanoid(10),
      tipo: tipo,
      importo: importo,
      data: data ? Timestamp.fromDate(new Date(data)) : Timestamp.now(),
      metodo: metodo,
      note: note,
      cashMovementId: cashMovementRef.id
    };
    
    // Aggiorna array pagamenti e ricalcola saldo
    const pagamentiAttuali = assignment.pagamenti || [];
    const nuoviPagamenti = [...pagamentiAttuali, pagamento];
    
    const totalePagato = nuoviPagamenti.reduce((sum, p) => sum + p.importo, 0);
    const nuovoSaldoResiduo = assignment.compenso - totalePagato;
    const isPagato = nuovoSaldoResiduo <= 0;
    
    // Aggiorna assegnazione
    await db.collection('jobCollaboratoreAssignments').doc(id).update({
      pagamenti: nuoviPagamenti,
      saldoResiduo: nuovoSaldoResiduo,
      isPagato: isPagato,
      dataPagamento: isPagato ? Timestamp.now() : assignment.dataPagamento,
      updatedAt: Timestamp.now()
    });
    
    // Invia email notifica pagamento (fire-and-forget)
    const dataJob = job?.eventDate 
      ? new Date(job.eventDate.toDate()).toLocaleDateString('it-IT', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }) 
      : 'Data da confermare';
    
    sendPaymentRegisteredEmail(
      req,
      { ...collaboratore, id: collaboratoreDoc.id },
      nomeJob,
      dataJob,
      importo,
      tipo,
      metodo,
      totalePagato,
      nuovoSaldoResiduo,
      note
    ).catch(err => console.error('❌ Email pagamento fallita (non bloccante):', err));
    
    res.json({ 
      success: true,
      saldoResiduo: nuovoSaldoResiduo,
      isPagato: isPagato,
      cashMovementId: cashMovementRef.id
    });
  } catch (error: any) {
    console.error('❌ Error adding payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/collaboratori/:id/regenerate-token
 * Rigenera token dashboard per un collaboratore
 */
router.post('/collaboratori/:id/regenerate-token', async (req, res) => {
  try {
    const { id } = req.params;
    
    const collaboratoreDoc = await db.collection('collaboratori').doc(id).get();
    if (!collaboratoreDoc.exists) {
      return res.status(404).json({ error: 'Collaboratore non trovato' });
    }
    
    const newToken = generateCollaboratorToken();
    
    await db.collection('collaboratori').doc(id).update({
      dashboardToken: newToken,
      hasAccess: true,
      updatedAt: Timestamp.now()
    });
    
    res.json({ 
      success: true, 
      dashboardToken: newToken,
      message: 'Token rigenerato con successo'
    });
  } catch (error: any) {
    console.error('❌ Error regenerating token:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/dashboard/:token
 * Dashboard collaboratore via link magico (pubblico)
 */
router.get('/collaboratori/dashboard/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    // Trova collaboratore con questo token
    const collaboratoriSnapshot = await db.collection('collaboratori')
      .where('dashboardToken', '==', token)
      .limit(1)
      .get();
    
    if (collaboratoriSnapshot.empty) {
      return res.status(404).json({ error: 'Token non valido o collaboratore non trovato' });
    }
    
    const collaboratoreDoc = collaboratoriSnapshot.docs[0];
    const collaboratore = { id: collaboratoreDoc.id, ...collaboratoreDoc.data() };
    
    // Recupera tutte le assegnazioni del collaboratore
    const assignmentsSnapshot = await db.collection('jobCollaboratoreAssignments')
      .where('collaboratoreId', '==', collaboratoreDoc.id)
      .orderBy('dataRichiesta', 'desc')
      .get();
    
    // Per ogni assegnazione, recupera i dati del job e dei clienti
    const assignments = await Promise.all(
      assignmentsSnapshot.docs.map(async (assignmentDoc) => {
        const assignment = assignmentDoc.data();
        const jobDoc = await db.collection('jobs').doc(assignment.jobId).get();
        const rawJobData = jobDoc.exists ? jobDoc.data() : null;
        
        // Prepara dati job con campi rilevanti per il collaboratore
        // Supporta sia job nuovi che job legacy importati
        let jobData: any = null;
        if (rawJobData) {
          // DEBUG: Log dati cerimonia raw
          console.log(`📋 Job ${jobDoc.id} - Dati cerimonia raw:`, {
            oraCerimonia: rawJobData.oraCerimonia,
            rituTime: rawJobData.rituTime,
            locationCerimonia: rawJobData.locationCerimonia,
            rituLocation: rawJobData.rituLocation,
            jobDataValues: rawJobData.jobDataValues,
          });
          
          // Normalizza i campi cerimonia (supporta sia nuovi che legacy)
          const oraCerimonia = rawJobData.oraCerimonia || rawJobData.rituTime || rawJobData.startTime || rawJobData.jobDataValues?.oraCerimonia;
          const locationCerimonia = rawJobData.locationCerimonia || rawJobData.rituLocation || rawJobData.jobDataValues?.locationCerimonia;
          
          console.log(`📋 Job ${jobDoc.id} - Dati cerimonia normalizzati:`, { oraCerimonia, locationCerimonia });
          
          // Normalizza ricevimento
          const oraRicevimento = rawJobData.oraRicevimento || rawJobData.jobDataValues?.oraRicevimento;
          const locationRicevimento = rawJobData.locationRicevimento || rawJobData.jobDataValues?.locationRicevimento || rawJobData.eventLocation;
          
          jobData = {
            id: jobDoc.id,
            nomeEvento: rawJobData.nomeEvento,
            eventDate: rawJobData.eventDate,
            eventLocation: rawJobData.eventLocation,
            jobType: rawJobData.jobType,
            stato: rawJobData.stato,
            note: rawJobData.note || rawJobData.noteInterne,
            // Dati evento compilati (orario cerimonia, location rito, ecc.)
            jobDataValues: rawJobData.jobDataValues || {},
            // Campi normalizzati (funzionano per nuovi e legacy)
            locationRicevimento,
            oraRicevimento,
            oraCerimonia,
            locationCerimonia,
            // Campi legacy aggiuntivi
            rituLocation: rawJobData.rituLocation,
            rituTime: rawJobData.rituTime,
          };
        }
        
        // Recupera TUTTI i clienti collegati al job
        const clienti: any[] = [];
        
        // Cliente principale
        if (rawJobData?.clienteId) {
          const clienteDoc = await db.collection('clienti').doc(rawJobData.clienteId).get();
          if (clienteDoc.exists) {
            const clienteData = clienteDoc.data();
            clienti.push({
              id: clienteDoc.id,
              nome: clienteData?.nome,
              cognome: clienteData?.cognome,
              email: clienteData?.email,
              cellulare: clienteData?.cellulare,
              whatsapp: clienteData?.whatsapp,
              indirizzo: clienteData?.indirizzo || clienteData?.via || clienteData?.address,
              citta: clienteData?.citta || clienteData?.city,
              isPrimary: true,
            });
          }
        }
        
        // Clienti secondari da clientiIds (se presenti)
        const processedClientIds = new Set<string>();
        if (rawJobData?.clienteId) processedClientIds.add(rawJobData.clienteId);
        
        if (rawJobData?.clientiIds && Array.isArray(rawJobData.clientiIds)) {
          for (const clienteId of rawJobData.clientiIds) {
            if (!processedClientIds.has(clienteId)) {
              processedClientIds.add(clienteId);
              const clienteDoc = await db.collection('clienti').doc(clienteId).get();
              if (clienteDoc.exists) {
                const clienteData = clienteDoc.data();
                clienti.push({
                  id: clienteDoc.id,
                  nome: clienteData?.nome,
                  cognome: clienteData?.cognome,
                  email: clienteData?.email,
                  cellulare: clienteData?.cellulare,
                  whatsapp: clienteData?.whatsapp,
                  indirizzo: clienteData?.indirizzo || clienteData?.via || clienteData?.address,
                  citta: clienteData?.citta || clienteData?.city,
                  isPrimary: false,
                });
              }
            }
          }
        }
        
        // Clienti da clientiRefs (se presenti)
        if (rawJobData?.clientiRefs && Array.isArray(rawJobData.clientiRefs)) {
          for (const ref of rawJobData.clientiRefs) {
            const clienteId = typeof ref === 'string' ? ref : ref?.id;
            if (clienteId && !processedClientIds.has(clienteId)) {
              processedClientIds.add(clienteId);
              const clienteDoc = await db.collection('clienti').doc(clienteId).get();
              if (clienteDoc.exists) {
                const clienteData = clienteDoc.data();
                clienti.push({
                  id: clienteDoc.id,
                  nome: clienteData?.nome,
                  cognome: clienteData?.cognome,
                  email: clienteData?.email,
                  cellulare: clienteData?.cellulare,
                  whatsapp: clienteData?.whatsapp,
                  indirizzo: clienteData?.indirizzo || clienteData?.via || clienteData?.address,
                  citta: clienteData?.citta || clienteData?.city,
                  isPrimary: false,
                });
              }
            }
          }
        }
        
        // Clienti embedded in clientiData (se presenti)
        if (rawJobData?.clientiData && Array.isArray(rawJobData.clientiData)) {
          for (const embeddedCliente of rawJobData.clientiData) {
            if (embeddedCliente && embeddedCliente.id && !processedClientIds.has(embeddedCliente.id)) {
              processedClientIds.add(embeddedCliente.id);
              clienti.push({
                id: embeddedCliente.id,
                nome: embeddedCliente.nome,
                cognome: embeddedCliente.cognome,
                email: embeddedCliente.email,
                cellulare: embeddedCliente.cellulare,
                whatsapp: embeddedCliente.whatsapp,
                indirizzo: embeddedCliente.indirizzo || embeddedCliente.via || embeddedCliente.address,
                citta: embeddedCliente.citta || embeddedCliente.city,
                isPrimary: false,
              });
            }
          }
        }
        
        // Mantiene anche il singolo cliente per retrocompatibilità
        const cliente = clienti.length > 0 ? clienti[0] : null;
        
        return {
          id: assignmentDoc.id,
          ...assignment,
          job: jobData,
          cliente,
          clienti, // Array con tutti i clienti
        };
      })
    );
    
    res.json({
      collaboratore,
      assignments
    });
  } catch (error: any) {
    console.error('❌ Error fetching collaborator dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Invia email reminder per evento imminente
 */
async function sendEventReminderEmail(
  req: express.Request,
  collaboratore: any,
  job: any,
  assignment: any
): Promise<void> {
  if (!collaboratore?.email) {
    console.log('⚠️ Email collaboratore mancante, reminder non inviato');
    return;
  }

  const studioInfo = await getStudioContactInfo();
  const siteUrl = getSiteBaseUrl(req);

  const ruoliLabels: Record<string, string> = {
    fotografo_secondario: 'Fotografo Secondario',
    videomaker: 'Videomaker',
    assistente: 'Assistente',
    photo_editor: 'Photo Editor',
    album_designer: 'Album Designer',
    altro: 'Altro'
  };

  const ruoloLabel = ruoliLabels[assignment.ruoloInJob] || assignment.ruoloInJob || 'Collaboratore';
  const jobNome = job?.nomeEvento || 'Lavoro';
  const eventLocation = job?.eventLocation || 'Da confermare';
  const mapsLink = job?.eventLocation 
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.eventLocation)}` 
    : null;
  
  // Gestione sicura della data evento
  let dataFormatted = 'Data da confermare';
  let oraFormatted = '';
  
  if (job?.eventDate) {
    try {
      const eventDate = job.eventDate?.toDate?.() || new Date(job.eventDate);
      if (!isNaN(eventDate.getTime())) {
        dataFormatted = eventDate.toLocaleDateString('it-IT', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        oraFormatted = eventDate.toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch (e) {
      console.log('⚠️ Impossibile formattare data evento per reminder');
    }
  }

  const dashboardUrl = (collaboratore?.hasAccess && collaboratore?.dashboardToken)
    ? `${siteUrl}/collaboratori/dashboard/${collaboratore.dashboardToken}`
    : null;

  const htmlContent = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
          Promemoria: Evento Domani
        </h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">
          ${studioInfo.name}
        </p>
      </div>
      
      <div style="padding: 30px 25px;">
        <p style="font-size: 18px; color: #333; margin: 0 0 25px 0;">
          Ciao <strong style="color: #f59e0b;">${collaboratore.nome} ${collaboratore.cognome}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
          Ti ricordiamo che <strong>domani</strong> hai un lavoro programmato. Ecco i dettagli:
        </p>
        
        <div style="background: #fffbeb; border-radius: 12px; padding: 25px; margin-bottom: 25px; border-left: 4px solid #f59e0b;">
          <h2 style="color: #92400e; margin: 0 0 20px 0; font-size: 20px; font-weight: 600;">
            ${jobNome}
          </h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; width: 120px;">Data:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${dataFormatted}</td>
            </tr>
            ${oraFormatted ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Orario:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${oraFormatted}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px;">Ruolo:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${ruoloLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">Luogo:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px;">
                ${eventLocation}
                ${mapsLink ? `<br/><a href="${mapsLink}" style="color: #f59e0b; text-decoration: underline;">Apri in Google Maps</a>` : ''}
              </td>
            </tr>
            ${assignment.prodottiAssegnati?.length > 0 ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">Prodotti:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px;">
                ${assignment.prodottiAssegnati.map((p: any) => `${p.label}${p.qty > 1 ? ` (x${p.qty})` : ''}`).join(', ')}
              </td>
            </tr>
            ` : ''}
            ${assignment.mansioniAssegnate?.length > 0 ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">Mansioni:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px;">
                ${assignment.mansioniAssegnate.join(', ')}
              </td>
            </tr>
            ` : ''}
            ${assignment.noteAdmin ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-size: 14px; vertical-align: top;">Note:</td>
              <td style="padding: 8px 0; color: #333; font-size: 14px;">${assignment.noteAdmin}</td>
            </tr>
            ` : ''}
          </table>
        </div>
        
        ${dashboardUrl ? `
        <div style="text-align: center; margin-bottom: 25px;">
          <a href="${dashboardUrl}" 
             style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); 
                    color: #ffffff; padding: 14px 35px; text-decoration: none; 
                    border-radius: 8px; font-weight: 600; font-size: 14px;">
            Visualizza Dashboard
          </a>
        </div>
        ` : ''}
        
        <p style="font-size: 14px; color: #666; line-height: 1.6; margin: 0;">
          Ti auguriamo un buon lavoro!
        </p>
      </div>
      
      <div style="background: #f8f5f2; padding: 20px 25px; text-align: center; border-top: 1px solid #e5e5e5;">
        <p style="font-size: 12px; color: #888; margin: 0;">
          ${studioInfo.name}<br/>
          ${studioInfo.email}${studioInfo.phone ? ` | ${studioInfo.phone}` : ''}
        </p>
      </div>
    </div>
  `;

  await sendGmailEmail({
    to: collaboratore.email,
    subject: `Promemoria: ${jobNome} - Domani | ${studioInfo.name}`,
    html: htmlContent
  }, req);

  console.log(`📧 Reminder email inviata a ${collaboratore.email} per job ${jobNome}`);
}

/**
 * POST /api/collaboratori/send-reminders
 * Invia reminder email a collaboratori con eventi il giorno successivo
 * Questo endpoint può essere chiamato da un cron job/scheduled function
 */
router.post('/collaboratori/send-reminders', async (req, res) => {
  try {
    // Calcola intervallo per "domani" (Europe/Rome timezone)
    // CRITICAL: Use Luxon for correct timezone handling (server runs in UTC)
    const nowRome = DateTime.now().setZone('Europe/Rome');
    const tomorrowRome = nowRome.plus({ days: 1 });
    
    // Inizio e fine di domani in Europe/Rome, convertiti a UTC per Firestore
    const startOfTomorrow = tomorrowRome.startOf('day').toJSDate();
    const endOfTomorrow = tomorrowRome.endOf('day').toJSDate();
    
    console.log(`🔔 Cercando eventi tra ${startOfTomorrow.toISOString()} e ${endOfTomorrow.toISOString()} (domani Rome: ${tomorrowRome.toFormat('yyyy-MM-dd')})`);
    
    // Trova tutti i jobs con eventi domani
    const jobsSnapshot = await db.collection('jobs')
      .where('eventDate', '>=', Timestamp.fromDate(startOfTomorrow))
      .where('eventDate', '<=', Timestamp.fromDate(endOfTomorrow))
      .get();
    
    if (jobsSnapshot.empty) {
      console.log('📭 Nessun evento programmato per domani');
      return res.json({ success: true, reminders_sent: 0, message: 'Nessun evento programmato per domani' });
    }
    
    const jobIds = jobsSnapshot.docs.map(doc => doc.id);
    const jobsMap = new Map(jobsSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
    
    console.log(`📅 Trovati ${jobIds.length} jobs con eventi domani`);
    
    // Trova tutte le assegnazioni accettate per questi jobs
    // Firestore non supporta 'in' con più di 30 elementi, quindi dividiamo se necessario
    let allAssignments: any[] = [];
    const chunks = [];
    for (let i = 0; i < jobIds.length; i += 30) {
      chunks.push(jobIds.slice(i, i + 30));
    }
    
    for (const chunk of chunks) {
      const assignmentsSnapshot = await db.collection('jobCollaboratoreAssignments')
        .where('jobId', 'in', chunk)
        .where('status', '==', 'accepted')
        .get();
      
      allAssignments = allAssignments.concat(
        assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      );
    }
    
    if (allAssignments.length === 0) {
      console.log('📭 Nessuna assegnazione accettata per gli eventi di domani');
      return res.json({ success: true, reminders_sent: 0, message: 'Nessuna assegnazione accettata per gli eventi di domani' });
    }
    
    console.log(`👥 Trovate ${allAssignments.length} assegnazioni accettate`);
    
    // Recupera i collaboratori
    const collaboratoreIds = [...new Set(allAssignments.map(a => a.collaboratoreId))];
    const collaboratoriMap = new Map<string, any>();
    
    for (const colId of collaboratoreIds) {
      const colDoc = await db.collection('collaboratori').doc(colId).get();
      if (colDoc.exists) {
        collaboratoriMap.set(colId, { id: colDoc.id, ...colDoc.data() });
      }
    }
    
    // Invia i reminder
    let remindersSent = 0;
    const errors: string[] = [];
    
    for (const assignment of allAssignments) {
      const collaboratore = collaboratoriMap.get(assignment.collaboratoreId);
      const job = jobsMap.get(assignment.jobId);
      
      if (!collaboratore || !job) {
        console.log(`⚠️ Collaboratore o job non trovato per assegnazione ${assignment.id}`);
        continue;
      }
      
      // Controlla se abbiamo già inviato un reminder oggi per questa assegnazione
      if (assignment.lastReminderSentAt) {
        const lastReminder = assignment.lastReminderSentAt.toDate?.() || new Date(assignment.lastReminderSentAt);
        const today = new Date();
        if (lastReminder.toDateString() === today.toDateString()) {
          console.log(`⏭️ Reminder già inviato oggi per assegnazione ${assignment.id}`);
          continue;
        }
      }
      
      try {
        await sendEventReminderEmail(req, collaboratore, job, assignment);
        
        // Aggiorna timestamp ultimo reminder
        await db.collection('jobCollaboratoreAssignments').doc(assignment.id).update({
          lastReminderSentAt: Timestamp.now()
        });
        
        remindersSent++;
      } catch (err: any) {
        console.error(`❌ Errore invio reminder per ${assignment.id}:`, err.message);
        errors.push(`${assignment.id}: ${err.message}`);
      }
    }
    
    console.log(`✅ Inviati ${remindersSent} reminder su ${allAssignments.length} assegnazioni`);
    
    res.json({
      success: true,
      reminders_sent: remindersSent,
      total_assignments: allAssignments.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    console.error('❌ Error sending reminders:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/collaboratori/upcoming-events
 * Lista eventi prossimi con assegnazioni (per preview admin)
 */
router.get('/collaboratori/upcoming-events', async (req, res) => {
  try {
    const { days = '7' } = req.query;
    const numDays = parseInt(days as string, 10) || 7;
    
    // CRITICAL: Use Luxon for correct timezone handling (server runs in UTC)
    const nowRome = DateTime.now().setZone('Europe/Rome');
    const now = nowRome.toJSDate();
    const futureDate = nowRome.plus({ days: numDays }).toJSDate();
    
    // Jobs nei prossimi N giorni
    const jobsSnapshot = await db.collection('jobs')
      .where('eventDate', '>=', Timestamp.fromDate(now))
      .where('eventDate', '<=', Timestamp.fromDate(futureDate))
      .orderBy('eventDate', 'asc')
      .get();
    
    const events = await Promise.all(
      jobsSnapshot.docs.map(async (jobDoc) => {
        const job = { id: jobDoc.id, ...jobDoc.data() };
        
        // Assegnazioni per questo job
        const assignmentsSnapshot = await db.collection('jobCollaboratoreAssignments')
          .where('jobId', '==', jobDoc.id)
          .get();
        
        const assignments = await Promise.all(
          assignmentsSnapshot.docs.map(async (aDoc) => {
            const assignment = aDoc.data();
            const colDoc = await db.collection('collaboratori').doc(assignment.collaboratoreId).get();
            return {
              id: aDoc.id,
              ...assignment,
              collaboratore: colDoc.exists ? { id: colDoc.id, ...colDoc.data() } : null
            };
          })
        );
        
        return {
          job,
          assignments,
          acceptedCount: assignments.filter(a => a.status === 'accepted').length,
          pendingCount: assignments.filter(a => a.status === 'pending').length
        };
      })
    );
    
    res.json(events);
  } catch (error: any) {
    console.error('❌ Error fetching upcoming events:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

/**
 * PAYMENT SCHEDULE UTILITIES
 * Logica condivisa calcolo rate e scadenze
 */

import type { PaymentScheduleConfig } from './quotes-types';

export interface ScheduledPaymentPreview {
  tipo: 'acconto' | 'rata' | 'saldo';
  importo: number;
  dataScadenza: Date;
  descrizione: string;
  giorniDaEvento?: number; // Per reference
}

export interface PaymentSchedulePreview {
  payments: ScheduledPaymentPreview[];
  totale: number;
  totaleAcconto: number;
  totaleSaldo: number;
}

/**
 * Calcola piano pagamenti con date relative a evento
 */
export function calculatePaymentSchedule(
  totale: number,
  config: PaymentScheduleConfig,
  eventDate?: Date
): PaymentSchedulePreview {
  const { numberOfPayments = 2, accontoType, accontoPercentage, accontoAmount, useEventDateReference, accontoRelativeDays = -30, rateIntervalDays = 30 } = config;

  // Calcola importo acconto
  let accontoImporto: number;
  if (accontoType === 'amount' && accontoAmount) {
    accontoImporto = Math.min(accontoAmount, totale); // Non superare totale
  } else {
    accontoImporto = (totale * (accontoPercentage || 30)) / 100;
  }

  // Arrotonda a 2 decimali
  accontoImporto = Math.round(accontoImporto * 100) / 100;

  const saldoAmount = totale - accontoImporto;
  const payments: ScheduledPaymentPreview[] = [];

  // Calcola data base per scadenze
  const referenceDate = useEventDateReference && eventDate ? new Date(eventDate) : new Date();

  // CASO 1: Pagamento unico
  if (numberOfPayments === 1) {
    const dueDate = new Date(referenceDate);
    if (useEventDateReference && eventDate) {
      dueDate.setDate(dueDate.getDate() + accontoRelativeDays);
    } else {
      dueDate.setDate(dueDate.getDate() + 7); // Default 7 giorni
    }

    payments.push({
      tipo: 'acconto',
      importo: totale,
      dataScadenza: dueDate,
      descrizione: 'Pagamento unico',
      giorniDaEvento: useEventDateReference && eventDate ? accontoRelativeDays : undefined
    });

    return {
      payments,
      totale,
      totaleAcconto: totale,
      totaleSaldo: 0
    };
  }

  // CASO 2: Acconto + Saldo (2 rate)
  if (numberOfPayments === 2) {
    // Acconto
    const accontoDate = new Date(referenceDate);
    if (useEventDateReference && eventDate) {
      accontoDate.setDate(accontoDate.getDate() + accontoRelativeDays);
    } else {
      accontoDate.setDate(accontoDate.getDate() + 7); // Default 7 giorni
    }

    payments.push({
      tipo: 'acconto',
      importo: accontoImporto,
      dataScadenza: accontoDate,
      descrizione: 'Acconto iniziale',
      giorniDaEvento: useEventDateReference && eventDate ? accontoRelativeDays : undefined
    });

    // Saldo
    const saldoDate = new Date(referenceDate);
    if (useEventDateReference && eventDate) {
      // Saldo: dopo l'evento (es. giorno evento + rateIntervalDays)
      saldoDate.setDate(saldoDate.getDate() + rateIntervalDays);
    } else {
      // Default: acconto + 30 giorni
      saldoDate.setTime(accontoDate.getTime());
      saldoDate.setDate(saldoDate.getDate() + rateIntervalDays);
    }

    payments.push({
      tipo: 'saldo',
      importo: saldoAmount,
      dataScadenza: saldoDate,
      descrizione: 'Saldo finale',
      giorniDaEvento: useEventDateReference && eventDate ? rateIntervalDays : undefined
    });

    return {
      payments,
      totale,
      totaleAcconto: accontoImporto,
      totaleSaldo: saldoAmount
    };
  }

  // CASO 3: Acconto + N rate intermedie + Saldo
  // Acconto
  const accontoDate = new Date(referenceDate);
  if (useEventDateReference && eventDate) {
    accontoDate.setDate(accontoDate.getDate() + accontoRelativeDays);
  } else {
    accontoDate.setDate(accontoDate.getDate() + 7);
  }

  payments.push({
    tipo: 'acconto',
    importo: accontoImporto,
    dataScadenza: accontoDate,
    descrizione: 'Acconto iniziale',
    giorniDaEvento: useEventDateReference && eventDate ? accontoRelativeDays : undefined
  });

  // Calcola rate intermedie (numberOfPayments - 2: escluso acconto e saldo)
  const numberOfIntermediatePayments = numberOfPayments - 2;
  const rataAmount = Math.round((saldoAmount / (numberOfIntermediatePayments + 1)) * 100) / 100;

  for (let i = 0; i < numberOfIntermediatePayments; i++) {
    const rataDate = new Date(referenceDate);
    
    if (useEventDateReference && eventDate) {
      // Rate distribuite prima dell'evento
      const dayOffset = accontoRelativeDays + ((i + 1) * rateIntervalDays);
      rataDate.setDate(rataDate.getDate() + dayOffset);
    } else {
      // Rate ogni rateIntervalDays giorni dall'acconto
      rataDate.setTime(accontoDate.getTime());
      rataDate.setDate(rataDate.getDate() + ((i + 1) * rateIntervalDays));
    }

    payments.push({
      tipo: 'rata',
      importo: rataAmount,
      dataScadenza: rataDate,
      descrizione: `Rata ${i + 1} di ${numberOfIntermediatePayments}`,
      giorniDaEvento: useEventDateReference && eventDate ? accontoRelativeDays + ((i + 1) * rateIntervalDays) : undefined
    });
  }

  // Saldo finale (compensa arrotondamenti)
  const totalePagamentiIntermedi = accontoImporto + (rataAmount * numberOfIntermediatePayments);
  const saldoFinale = Math.round((totale - totalePagamentiIntermedi) * 100) / 100;

  const saldoDate = new Date(referenceDate);
  if (useEventDateReference && eventDate) {
    // Saldo dopo evento
    saldoDate.setDate(saldoDate.getDate() + rateIntervalDays);
  } else {
    // Ultima rata + interval
    saldoDate.setTime(accontoDate.getTime());
    saldoDate.setDate(saldoDate.getDate() + (numberOfPayments * rateIntervalDays));
  }

  payments.push({
    tipo: 'saldo',
    importo: saldoFinale,
    dataScadenza: saldoDate,
    descrizione: 'Saldo finale',
    giorniDaEvento: useEventDateReference && eventDate ? rateIntervalDays : undefined
  });

  return {
    payments,
    totale,
    totaleAcconto: accontoImporto,
    totaleSaldo: saldoAmount
  };
}

/**
 * Valida configurazione piano pagamenti
 */
export function validatePaymentScheduleConfig(
  config: PaymentScheduleConfig,
  totale: number
): { valid: boolean; error?: string } {
  if (!config.autoGenerate) {
    return { valid: true }; // Se non auto-genera, nessuna validazione necessaria
  }

  // Valida numero rate
  if (!config.numberOfPayments || config.numberOfPayments < 1 || config.numberOfPayments > 10) {
    return { valid: false, error: 'Numero rate deve essere tra 1 e 10' };
  }

  // Valida acconto
  if (config.accontoType === 'percentage') {
    if (!config.accontoPercentage || config.accontoPercentage < 0 || config.accontoPercentage > 100) {
      return { valid: false, error: 'Percentuale acconto deve essere tra 0% e 100%' };
    }
  } else if (config.accontoType === 'amount') {
    if (!config.accontoAmount || config.accontoAmount < 0) {
      return { valid: false, error: 'Importo acconto deve essere maggiore di 0' };
    }
    if (config.accontoAmount > totale) {
      return { valid: false, error: 'Importo acconto non può superare il totale' };
    }
  }

  return { valid: true };
}

/**
 * Formatta data scadenza per display
 */
export function formatDueDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formatta importo per display
 */
export function formatCurrency(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

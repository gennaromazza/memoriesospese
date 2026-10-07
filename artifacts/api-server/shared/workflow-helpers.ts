import { WorkflowState } from './schema';

/**
 * Rank table per WorkflowState
 * Ordine crescente: stato iniziale → stato finale
 */
const WORKFLOW_STATE_RANK: Record<WorkflowState, number> = {
  [WorkflowState.SHOOTING_DA_SVOLGERE]: 1,
  [WorkflowState.SHOOTING_COMPLETATO]: 2,
  [WorkflowState.IN_LAVORAZIONE]: 3,
  [WorkflowState.IN_ATTESA_SELEZIONE]: 4,
  [WorkflowState.PRONTO_RITIRO]: 5,
  [WorkflowState.CONSEGNATO]: 6,
};

/**
 * FIX #2: Sincronizzazione unidirezionale stato → statoWorkflow
 * 
 * Logica:
 * - `stato` è autoritativo (customer-facing: in_attesa → confermata → completata → annullata)
 * - `statoWorkflow` è pipeline operativa (granulare: shooting → lavorazione → selezione → consegnato)
 * - Helper NON fa downgrade: se admin ha avanzato workflow manualmente, lo preserva SEMPRE
 * - Helper PRESERVA undefined per legacy bookings (omette campo da update payload)
 * 
 * @param stato - Stato appuntamento cliente
 * @param currentWorkflowState - Stato workflow corrente (opzionale/undefined per legacy)
 * @returns Oggetto spread-safe: {} se nessun update, { statoWorkflow: value } se deve essere aggiornato
 */
export function syncBookingWorkflowState(
  stato: string,
  currentWorkflowState?: WorkflowState
): { statoWorkflow?: WorkflowState } {
  // Determina stato workflow target minimo basato su stato cliente
  let targetState: WorkflowState | undefined;

  switch (stato) {
    case 'in_attesa':
    case 'confermata':
      // Booking confermato → pronto per shooting (solo se undefined)
      targetState = WorkflowState.SHOOTING_DA_SVOLGERE;
      break;

    case 'completata':
      // Booking completato → PRONTO_RITIRO (non SHOOTING_COMPLETATO!)
      // Fix: usa PRONTO_RITIRO per permettere transizioni manuali successive
      targetState = WorkflowState.PRONTO_RITIRO;
      break;

    case 'annullata':
    case 'cancellata':
    case 'cancellation_pending':
      // Booking annullato → PRESERVA workflow esistente (no changes)
      // Fix: return {} per omettere campo da Firestore update (evita undefined rejection)
      return {};

    default:
      // Fallback sicuro: preserva stato corrente (ometti campo se undefined)
      return currentWorkflowState ? { statoWorkflow: currentWorkflowState } : {};
  }

  // Se workflow corrente è undefined → imposta target SOLO per in_attesa/confermata/completata
  // Per annullata, torna {} (già gestito sopra)
  if (!currentWorkflowState) {
    // Fix: per completata senza workflow, imposta PRONTO_RITIRO
    // Per in_attesa/confermata senza workflow, imposta SHOOTING_DA_SVOLGERE
    return { statoWorkflow: targetState };
  }

  // GUARD: Se workflow corrente non è in rank table (es. ARCHIVIATO legacy) → preserva as-is
  const currentRank = WORKFLOW_STATE_RANK[currentWorkflowState];
  if (currentRank === undefined) {
    // Stato non riconosciuto/legacy → preserva senza modifiche
    return { statoWorkflow: currentWorkflowState };
  }

  // GUARD: Se target non è in rank table (dovrebbe essere impossibile ma safe) → preserva current
  const targetRank = WORKFLOW_STATE_RANK[targetState!];
  if (targetRank === undefined) {
    // Target invalido → preserva current
    return { statoWorkflow: currentWorkflowState };
  }

  // Se workflow corrente ha rank >= target → PRESERVA (no downgrade)
  // Questo permette admin di avanzare manualmente oltre il target
  const finalState = currentRank >= targetRank ? currentWorkflowState : targetState;
  return { statoWorkflow: finalState };
}

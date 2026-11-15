import { describe, expect, it } from 'vitest';
import { WorkflowState } from '@shared/schema';
import { getWorkflowStateAfterOrderCreation } from './bookings';

describe('avanzamento workflow alla creazione ordine', () => {
  it.each([undefined, WorkflowState.SHOOTING_DA_SVOLGERE])(
    'completa uno shooting non ancora svolto (%s)',
    currentState => {
      expect(getWorkflowStateAfterOrderCreation(currentState)).toBe(WorkflowState.SHOOTING_COMPLETATO);
    },
  );

  it.each([
    WorkflowState.SHOOTING_COMPLETATO,
    WorkflowState.IN_ATTESA_SELEZIONE,
    WorkflowState.IN_LAVORAZIONE,
    WorkflowState.PRONTO_RITIRO,
    WorkflowState.CONSEGNATO,
  ])('non riporta indietro un workflow già avanzato (%s)', currentState => {
    expect(getWorkflowStateAfterOrderCreation(currentState)).toBeNull();
  });
});

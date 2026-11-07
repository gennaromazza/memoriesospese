import { describe, expect, it } from 'vitest';
import { labTransferDisplay } from './lab-transfer-display';

describe('labTransferDisplay', () => {
  it('shows progress and keeps polling only while transfer is active', () => {
    expect(labTransferDisplay({ status: 'pending', total: 8, transferred: 0 })).toMatchObject({
      label: 'In attesa del trasferimento',
      total: 8,
      transferred: 0,
      percent: 0,
      shouldPoll: true,
      canRetry: false,
    });
    expect(labTransferDisplay({ status: 'running', total: 8, transferred: 3 })).toMatchObject({
      label: 'Trasferimento in corso',
      transferred: 3,
      percent: 38,
      shouldPoll: true,
      canRetry: false,
    });
  });

  it('stops polling at completion and reports all files transferred', () => {
    expect(labTransferDisplay({ status: 'completed', total: 8, transferred: 5 })).toMatchObject({
      label: 'Trasferimento completato',
      percent: 100,
      shouldPoll: false,
      canRetry: false,
    });
  });

  it.each(['failed', 'partial'] as const)('exposes retry and a useful error for %s transfers', (status) => {
    expect(labTransferDisplay({
      status,
      total: 4,
      transferred: 2,
      lastError: 'Drive non raggiungibile',
    })).toMatchObject({
      label: status === 'failed' ? 'Trasferimento non riuscito' : 'Trasferimento incompleto',
      percent: 50,
      shouldPoll: false,
      canRetry: true,
      error: 'Drive non raggiungibile',
    });
  });

  it('clamps invalid progress values and falls back to a failed-file error', () => {
    expect(labTransferDisplay({
      status: 'failed',
      total: 2,
      transferred: 7,
      failed: [{ error: 'Foto non disponibile' }],
    })).toMatchObject({
      transferred: 2,
      percent: 100,
      error: 'Foto non disponibile',
    });
  });
});

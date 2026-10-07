import { describe, expect, it } from 'vitest';
import { onlineVisibility } from './giftCardAdminShared';

describe('onlineVisibility', () => {
  const today = '2026-11-20';

  it('spiega perché un regalo non si vede sul sito', () => {
    expect(onlineVisibility({ active: false, sellOnline: true, sellUntil: null }, today)).toMatchObject({ visible: false, reason: expect.stringContaining('nascosto') });
    expect(onlineVisibility({ active: true, sellOnline: false, sellUntil: null }, today)).toMatchObject({ visible: false, reason: expect.stringContaining('Non è in vendita sul sito') });
    expect(onlineVisibility({ active: true, sellOnline: true, sellUntil: '2026-11-19' }, today)).toMatchObject({ visible: false, reason: expect.stringContaining('finita') });
  });

  it('un regalo online e attivo è visibile, con la data limite se c\'è', () => {
    expect(onlineVisibility({ active: true, sellOnline: true, sellUntil: null }, today)).toEqual({ visible: true, reason: 'Compare su /regala.' });
    const withDate = onlineVisibility({ active: true, sellOnline: true, sellUntil: '2026-12-20' }, today);
    expect(withDate.visible).toBe(true);
    expect(withDate.reason).toContain('fino al');
  });

  it('l\'ultimo giorno di vendita è ancora visibile', () => {
    expect(onlineVisibility({ active: true, sellOnline: true, sellUntil: today }, today).visible).toBe(true);
  });
});

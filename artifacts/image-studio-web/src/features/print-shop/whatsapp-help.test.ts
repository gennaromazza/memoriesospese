import { describe, expect, it } from 'vitest';
import { printShopHelpMessage, printShopWhatsAppUrl, validWhatsAppDigits } from './whatsapp-help';

describe('print shop WhatsApp help', () => {
  it('validates numbers', () => {
    expect(validWhatsAppDigits('333 123 4567')).toBe('393331234567');
    expect(validWhatsAppDigits('081 123 4567')).toBe('390811234567');
    expect(validWhatsAppDigits('0039 081 1234567')).toBe('390811234567');
    expect(validWhatsAppDigits('+44 7911 123456')).toBe('447911123456');
    expect(validWhatsAppDigits('++39 3331234567')).toBe('');
    expect(validWhatsAppDigits('abc1234567')).toBe('');
    expect(validWhatsAppDigits('0000000')).toBe('');
    expect(validWhatsAppDigits('123')).toBe('');
  });
  it('prefers whatsapp then phone', () => {
    expect(printShopWhatsAppUrl({ whatsapp: 'x', phone: '3331234567' })).toContain('wa.me/393331234567');
    expect(printShopWhatsAppUrl({ whatsapp: '', phone: '' })).toBeNull();
  });
  it('mentions order number only when real', () => {
    expect(printShopHelpMessage('')).not.toContain('undefined');
    expect(printShopHelpMessage('PS-1')).toContain('PS-1');
  });
});

import { describe, expect, it } from 'vitest';
import { isAllowedPrintUploadOrigin, resolvePrintUploadOrigin } from './upload-origin.js';

describe('print shop upload origin', () => {
  it('accepts the public site and genuine Replit preview hosts', () => {
    expect(isAllowedPrintUploadOrigin('https://imagestudiofotografico.com')).toBe(true);
    expect(isAllowedPrintUploadOrigin('https://preview.spock.replit.dev')).toBe(true);
    expect(resolvePrintUploadOrigin({
      origin: 'https://preview.spock.replit.dev',
      protocol: 'https',
      host: 'ignored.example',
    })).toBe('https://preview.spock.replit.dev');
  });

  it('rejects lookalike or arbitrary origins', () => {
    expect(isAllowedPrintUploadOrigin('https://preview.replit.dev.evil.example')).toBe(false);
    expect(resolvePrintUploadOrigin({ origin: 'https://evil.example' })).toBeUndefined();
    expect(resolvePrintUploadOrigin({ protocol: 'https', host: 'evil.example' })).toBeUndefined();
  });
});

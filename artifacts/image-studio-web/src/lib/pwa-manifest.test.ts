import { describe, expect, it } from 'vitest';
import { appTitleForPath, isAdminPath, isClientAreaPath, manifestForPath } from './pwa-manifest';

describe('PWA manifest routing', () => {
  it('usa il manifest admin per login, dashboard e pagine interne', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(manifestForPath('/admin/dashboard')).toContain('admin-manifest.json');
    expect(manifestForPath('/admin/jobs/123')).toContain('admin-manifest.json');
  });

  it('mantiene il manifest pubblico fuori dall’area admin', () => {
    expect(isAdminPath('/')).toBe(false);
    expect(manifestForPath('/portfolio')).toContain('manifest.json?v=3');
  });

  it('usa un manifest dedicato per l’area cliente installabile', () => {
    expect(isClientAreaPath('/area-cliente')).toBe(true);
    expect(isClientAreaPath('/area-clienti-falsa')).toBe(false);
    expect(manifestForPath('/area-cliente')).toContain('area-cliente-manifest.json');
    expect(appTitleForPath('/area-cliente')).toBe('La mia area');
    expect(appTitleForPath('/admin')).toBe('Studio Admin');
  });
});

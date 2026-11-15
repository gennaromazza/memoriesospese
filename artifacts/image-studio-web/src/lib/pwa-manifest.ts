export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function isClientAreaPath(pathname: string): boolean {
  return pathname === '/area-cliente' || pathname.startsWith('/area-cliente/');
}

export function manifestForPath(pathname: string): string {
  if (isAdminPath(pathname)) return '/admin-manifest.json?v=1';
  if (isClientAreaPath(pathname)) return '/area-cliente-manifest.json?v=1';
  return '/manifest.json?v=3';
}

export function appTitleForPath(pathname: string): string {
  if (isAdminPath(pathname)) return 'Studio Admin';
  if (isClientAreaPath(pathname)) return 'La mia area';
  return 'Image Studio';
}

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function manifestForPath(pathname: string): string {
  return isAdminPath(pathname) ? '/admin-manifest.json?v=1' : '/manifest.json?v=3';
}

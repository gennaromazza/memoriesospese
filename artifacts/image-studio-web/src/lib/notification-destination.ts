export function resolveNotificationDestination(
  deepLink: string,
  currentHref: string,
): string | null {
  try {
    const current = new URL(currentHref);
    const target = new URL(deepLink, current.origin);

    if (
      target.origin !== current.origin ||
      (target.protocol !== 'http:' && target.protocol !== 'https:')
    ) {
      return null;
    }

    // The authenticated admin screen lives at /admin/dashboard. Keep older
    // notification links working without sending an already signed-in user
    // through the login route.
    if (target.pathname === '/admin') {
      target.pathname = '/admin/dashboard';
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function isAtNotificationDestination(
  currentHref: string,
  destination: string,
): boolean {
  try {
    const current = new URL(currentHref);
    const target = new URL(destination, current.origin);

    const requiredQueryMatches = Array.from(target.searchParams.entries()).every(
      ([key, value]) => current.searchParams.getAll(key).includes(value),
    );

    return (
      current.origin === target.origin &&
      current.pathname === target.pathname &&
      requiredQueryMatches &&
      (!target.hash || current.hash === target.hash)
    );
  } catch {
    return false;
  }
}

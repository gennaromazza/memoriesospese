import { describe, expect, it } from 'vitest';
import {
  isAtNotificationDestination,
  resolveNotificationDestination,
} from './notification-destination';

describe('notification destinations', () => {
  it('sends legacy admin-root links directly to the signed-in dashboard', () => {
    expect(
      resolveNotificationDestination(
        '/admin?printOrderId=shop-order-1',
        'https://studio.example.test/admin/dashboard',
      ),
    ).toBe('/admin/dashboard?printOrderId=shop-order-1');
  });

  it('detects a stale query even when the dashboard pathname is already correct', () => {
    expect(
      isAtNotificationDestination(
        'https://studio.example.test/admin/dashboard?tab=bookings',
        '/admin/dashboard?tab=consulenze&consultation=consultation-1',
      ),
    ).toBe(false);
  });

  it('accepts the requested route and required query parameters', () => {
    expect(
      isAtNotificationDestination(
        'https://studio.example.test/admin/dashboard?tab=consulenze&consultation=consultation-1',
        '/admin/dashboard?tab=consulenze&consultation=consultation-1',
      ),
    ).toBe(true);
  });

  it('does not navigate to an external origin', () => {
    expect(
      resolveNotificationDestination(
        'https://outside.example.test/admin',
        'https://studio.example.test/admin/dashboard',
      ),
    ).toBeNull();
  });
});

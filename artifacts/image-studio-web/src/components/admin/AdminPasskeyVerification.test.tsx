// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminSecurityStatus } from '@/lib/admin-passkey';

vi.mock('wouter', () => ({
  useLocation: () => ['/admin/dashboard', vi.fn()],
}));

vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null } }));

vi.mock('firebase/auth', () => ({
  onIdTokenChanged: vi.fn(() => () => undefined),
  signOut: vi.fn(),
}));

vi.mock('@/lib/admin-passkey', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/admin-passkey')>();
  return {
    ...actual,
    AdminPasskeyClient: {
      ...actual.AdminPasskeyClient,
      supportsPasskeys: () => true,
    },
  };
});

const status: AdminSecurityStatus = {
  passkeyRequired: true,
  passkeys: [{
    id: 'phone-passkey',
    label: 'Telefono',
    rpId: 'imagestudiofotografico.com',
    deviceType: 'multiDevice',
    backedUp: true,
    createdAt: 1,
    lastUsedAt: null,
  }],
  rememberedDevices: [],
  rememberedDeviceId: null,
  recoveryCodesRemaining: 1,
  recoveryCodesGeneratedAt: 1,
  lockedUntil: null,
  verified: false,
  activationReady: true,
  verifiedUntil: null,
  expectedClaim: null,
};

function renderVerification() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPasskeyVerification status={status} />
    </QueryClientProvider>,
  );
}

import { AdminPasskeyVerification } from './AdminRouteGuard';

afterEach(() => cleanup());

describe('modale QR della verifica passkey', () => {
  it('mantiene compatta la verifica e apre la procedura QR espandibile', () => {
    renderVerification();

    expect(screen.getByRole('heading', { name: 'Verifica passkey' })).toBeTruthy();
    expect(screen.queryByTestId('dialog-device-enrollment')).toBeNull();

    fireEvent.click(screen.getByTestId('button-open-device-enrollment'));

    const dialog = screen.getByTestId('dialog-device-enrollment');
    expect(dialog).toBeTruthy();
    expect(screen.getByTestId('panel-device-enrollment-unavailable')).toBeTruthy();

    fireEvent.click(screen.getByTestId('button-toggle-device-enrollment-size'));
    expect(screen.getByRole('button', { name: 'Riduci finestra QR' })).toBeTruthy();
    expect(dialog.className).toContain('max-w-4xl');
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminSecurityStatus } from '@/lib/admin-passkey';
import { AdminPasskeyVerification } from './AdminRouteGuard';

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

function renderVerification(securityStatus: AdminSecurityStatus = status) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPasskeyVerification status={securityStatus} />
    </QueryClientProvider>,
  );
}

afterEach(() => cleanup());

describe('modale QR della verifica passkey', () => {
  it('mantiene compatta la verifica e apre la procedura QR espandibile', () => {
    renderVerification();

    expect(screen.getByRole('heading', { name: 'Verifica passkey' })).toBeTruthy();
    expect(screen.queryByTestId('dialog-device-enrollment')).toBeNull();
    expect(screen.getByTestId('button-start-preview-handoff')).toBeTruthy();

    fireEvent.click(screen.getByTestId('button-toggle-passkey-options'));
    expect(screen.getByTestId('button-use-recovery-code')).toBeTruthy();
    fireEvent.click(screen.getByTestId('button-open-device-enrollment'));

    const dialog = screen.getByTestId('dialog-device-enrollment');
    expect(dialog).toBeTruthy();
    expect(screen.getByTestId('panel-device-enrollment-unavailable')).toBeTruthy();

    fireEvent.click(screen.getByTestId('button-toggle-device-enrollment-size'));
    expect(screen.getByRole('button', { name: 'Riduci finestra QR' })).toBeTruthy();
    expect(dialog.className).toContain('max-w-4xl');
  });

  it('riunisce l’avviso e l’azione di aggiornamento sessione in un solo riquadro', () => {
    renderVerification({
      ...status,
      expectedClaim: { req: true, exp: 2, at: 1, sat: 1 },
    });

    expect(screen.getByTestId('panel-passkey-session-refresh')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aggiorna sessione' })).toBeTruthy();
    expect(screen.queryByText(/Se hai appena attivato l'obbligo/)).toBeNull();
  });
});

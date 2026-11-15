// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminPasskeyRefreshError,
  AdminSecurityError,
  type AdminSecurityStatus,
} from '@/lib/admin-passkey';
import { AdminPasskeyVerification } from './AdminRouteGuard';

const passkeyMocks = vi.hoisted(() => ({
  supportsPasskeys: vi.fn(() => true),
  verify: vi.fn(async () => 0),
  redeemRecoveryCode: vi.fn(async () => 0),
  refreshEnforcementClaim: vi.fn(async () => undefined),
}));

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
      supportsPasskeys: passkeyMocks.supportsPasskeys,
      verify: passkeyMocks.verify,
      redeemRecoveryCode: passkeyMocks.redeemRecoveryCode,
      refreshEnforcementClaim: passkeyMocks.refreshEnforcementClaim,
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

function statusWithLocalPasskey(): AdminSecurityStatus {
  return {
    ...status,
    passkeys: status.passkeys.map((passkey) => ({
      ...passkey,
      rpId: window.location.hostname,
    })),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  passkeyMocks.supportsPasskeys.mockReturnValue(true);
  passkeyMocks.verify.mockResolvedValue(0);
  passkeyMocks.redeemRecoveryCode.mockResolvedValue(0);
  passkeyMocks.refreshEnforcementClaim.mockResolvedValue(undefined);
});

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

describe('recupero passkey', () => {
  it('rende principale il codice se il browser non supporta le passkey', () => {
    passkeyMocks.supportsPasskeys.mockReturnValue(false);
    renderVerification(statusWithLocalPasskey());

    expect(screen.getByTestId('button-use-recovery-code-primary')).toBeTruthy();
    expect(screen.queryByTestId('button-verify-passkey')).toBeNull();
  });

  it('apre il recupero se il browser non trova una passkey utilizzabile', async () => {
    passkeyMocks.verify.mockRejectedValueOnce(
      Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' }),
    );
    renderVerification(statusWithLocalPasskey());

    fireEvent.click(screen.getByTestId('button-verify-passkey'));

    expect(await screen.findByTestId('input-recovery-code')).toBeTruthy();
    expect(screen.getByTestId('text-passkey-error').textContent).toContain(
      'Puoi usare un codice di recupero',
    );
  });

  it('mostra un errore comprensibile quando il codice non è valido o è già stato usato', async () => {
    passkeyMocks.supportsPasskeys.mockReturnValue(false);
    passkeyMocks.redeemRecoveryCode.mockRejectedValueOnce(
      new AdminSecurityError(400, 'invalid_recovery_code', 'Codice di recupero non valido'),
    );
    renderVerification(statusWithLocalPasskey());

    fireEvent.click(screen.getByTestId('button-use-recovery-code-primary'));
    fireEvent.change(screen.getByTestId('input-recovery-code'), {
      target: { value: 'AAAA-BBBB-CCCC' },
    });
    fireEvent.click(screen.getByTestId('button-submit-recovery-code'));

    expect(await screen.findByTestId('text-passkey-error')).toHaveProperty(
      'textContent',
      'Codice di recupero non valido',
    );
    expect(passkeyMocks.redeemRecoveryCode).toHaveBeenCalledTimes(1);
  });

  it('riprende l’aggiornamento sessione senza inviare di nuovo il codice consumato', async () => {
    const expectedClaim = { req: true, exp: 2, at: 1, sat: 1 };
    passkeyMocks.supportsPasskeys.mockReturnValue(false);
    passkeyMocks.redeemRecoveryCode.mockRejectedValueOnce(
      new AdminPasskeyRefreshError(expectedClaim),
    );
    renderVerification(statusWithLocalPasskey());

    fireEvent.click(screen.getByTestId('button-use-recovery-code-primary'));
    fireEvent.change(screen.getByTestId('input-recovery-code'), {
      target: { value: 'AAAA-BBBB-CCCC' },
    });
    fireEvent.click(screen.getByTestId('button-submit-recovery-code'));

    expect(await screen.findByTestId('panel-passkey-session-refresh')).toBeTruthy();
    expect(screen.queryByTestId('input-recovery-code')).toBeNull();
    fireEvent.click(screen.getByTestId('button-retry-passkey-token-refresh'));

    await waitFor(() => {
      expect(passkeyMocks.refreshEnforcementClaim).toHaveBeenCalledWith(expectedClaim);
    });
    expect(passkeyMocks.redeemRecoveryCode).toHaveBeenCalledTimes(1);
  });

  it('mantiene il recupero disabilitato durante il blocco temporaneo', () => {
    passkeyMocks.supportsPasskeys.mockReturnValue(false);
    renderVerification({
      ...statusWithLocalPasskey(),
      lockedUntil: Date.now() + 60_000,
    });

    expect(screen.getByTestId('text-security-locked')).toBeTruthy();
    expect(screen.getByTestId('button-use-recovery-code-primary')).toHaveProperty('disabled', true);
  });
});

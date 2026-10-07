import type { NextFunction, Request, Response } from 'express';
import type { TokenPayload } from 'google-auth-library';
import { describe, expect, it, vi } from 'vitest';
import {
  PRINT_SHOP_MAINTENANCE_AUDIENCE,
  PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT,
  PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT_SUBJECT,
  createMaintenanceOidcMiddleware,
  type MaintenanceIdTokenVerifier,
} from './maintenance-auth.js';

function validPayload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    iss: 'https://accounts.google.com',
    aud: PRINT_SHOP_MAINTENANCE_AUDIENCE,
    sub: PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT_SUBJECT,
    email: PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT,
    email_verified: true,
    iat: 1_700_000_000,
    exp: 1_700_003_600,
    ...overrides,
  };
}

async function invokeMiddleware(options: {
  authorization?: string;
  payload?: TokenPayload;
  verifyError?: Error;
}) {
  const verify = vi.fn(async () => {
    if (options.verifyError) throw options.verifyError;
    return options.payload;
  });
  const verifier: MaintenanceIdTokenVerifier = { verify };
  const middleware = createMaintenanceOidcMiddleware({ verifier });
  const req = {
    get: vi.fn((name: string) => (
      name.toLowerCase() === 'authorization' ? options.authorization : undefined
    )),
  } as unknown as Request;
  const res = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  const next = vi.fn() as unknown as NextFunction;

  await (middleware as (
    request: Request,
    response: Response,
    nextFunction: NextFunction,
  ) => Promise<void>)(req, res, next);

  return { verify, res, next };
}

describe('print-shop maintenance OIDC authentication', () => {
  it('accepts a Google-signed token only for the canonical audience and runtime identity', async () => {
    const result = await invokeMiddleware({
      authorization: 'Bearer signed.google.id-token',
      payload: validPayload(),
    });

    expect(result.verify).toHaveBeenCalledWith(
      'signed.google.id-token',
      PRINT_SHOP_MAINTENANCE_AUDIENCE,
    );
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.res.status).not.toHaveBeenCalled();
    expect(result.res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store, max-age=0',
    );
  });

  it('rejects a missing bearer token without invoking Google verification', async () => {
    const result = await invokeMiddleware({ payload: validPayload() });

    expect(result.verify).not.toHaveBeenCalled();
    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a token minted for a different audience', async () => {
    const result = await invokeMiddleware({
      authorization: 'Bearer wrong-audience-token',
      payload: validPayload({ aud: 'https://preview.example/api/print-shop/internal/retention' }),
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a valid Google token belonging to another email', async () => {
    const result = await invokeMiddleware({
      authorization: 'Bearer wrong-email-token',
      payload: validPayload({ email: 'another-service-account@example.iam.gserviceaccount.com' }),
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.status).toHaveBeenCalledWith(401);
  });

  it('rejects the right email when the immutable service-account subject differs', async () => {
    const result = await invokeMiddleware({
      authorization: 'Bearer wrong-subject-token',
      payload: validPayload({ sub: '999999999999999999999' }),
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.status).toHaveBeenCalledWith(401);
  });

  it('rejects an unverified email claim', async () => {
    const result = await invokeMiddleware({
      authorization: 'Bearer unverified-email-token',
      payload: validPayload({ email_verified: false }),
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.status).toHaveBeenCalledWith(401);
  });

  it('rejects a non-Google issuer even if every other claim matches', async () => {
    const result = await invokeMiddleware({
      authorization: 'Bearer wrong-issuer-token',
      payload: validPayload({ iss: 'https://accounts.example.test' }),
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.status).toHaveBeenCalledWith(401);
  });

  it('fails closed when signature, expiry or certificate verification throws', async () => {
    const result = await invokeMiddleware({
      authorization: 'Bearer invalid-signature-token',
      verifyError: new Error('invalid signature'),
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.status).toHaveBeenCalledWith(401);
    expect(result.res.json).toHaveBeenCalledWith({
      error: {
        code: 'maintenance_unauthenticated',
        message: 'Accesso negato',
      },
    });
  });
});

import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export const PRINT_SHOP_MAINTENANCE_AUDIENCE =
  'https://imagestudiofotografico.com/api/print-shop/internal/retention';
export const PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT =
  'print-shop-retention-scheduler@wedding-gallery-397b6.iam.gserviceaccount.com';
export const PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT_SUBJECT =
  '105371135025815975682';

const GOOGLE_ID_TOKEN_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
]);

export interface MaintenanceIdTokenVerifier {
  verify(idToken: string, audience: string): Promise<TokenPayload | undefined>;
}

export interface MaintenanceOidcOptions {
  audience?: string;
  serviceAccountEmail?: string;
  serviceAccountSubject?: string;
  verifier?: MaintenanceIdTokenVerifier;
}

const googleOAuthClient = new OAuth2Client();

const googleIdTokenVerifier: MaintenanceIdTokenVerifier = {
  async verify(idToken, audience) {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken,
      audience,
    });
    return ticket.getPayload();
  },
};

/**
 * Defense-in-depth claim validation after google-auth-library has verified the
 * signature, expiry and requested audience. Keeping these checks explicit makes
 * the single scheduler identity part of the endpoint contract.
 */
export function hasExpectedMaintenanceClaims(
  payload: TokenPayload | undefined,
  audience = PRINT_SHOP_MAINTENANCE_AUDIENCE,
  serviceAccountEmail = PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT,
  serviceAccountSubject = PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT_SUBJECT,
): payload is TokenPayload {
  return Boolean(
    payload
      && payload.aud === audience
      && payload.email === serviceAccountEmail
      && payload.email_verified === true
      && GOOGLE_ID_TOKEN_ISSUERS.has(payload.iss)
      && payload.sub === serviceAccountSubject,
  );
}

export function extractBearerIdToken(authorization: string | undefined): string | undefined {
  const match = authorization?.trim().match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

export function createMaintenanceOidcMiddleware(
  options: MaintenanceOidcOptions = {},
): RequestHandler {
  const audience = options.audience ?? PRINT_SHOP_MAINTENANCE_AUDIENCE;
  const serviceAccountEmail = options.serviceAccountEmail
    ?? PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT;
  const serviceAccountSubject = options.serviceAccountSubject
    ?? PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT_SUBJECT;
  const verifier = options.verifier ?? googleIdTokenVerifier;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    const token = extractBearerIdToken(req.get('authorization'));
    if (!token) {
      rejectMaintenanceRequest(res);
      return;
    }

    try {
      const payload = await verifier.verify(token, audience);
      if (!hasExpectedMaintenanceClaims(
        payload,
        audience,
        serviceAccountEmail,
        serviceAccountSubject,
      )) {
        rejectMaintenanceRequest(res);
        return;
      }
      next();
    } catch {
      // Signature, expiry, certificate retrieval and malformed-token failures all
      // intentionally return the same response without logging the bearer token.
      rejectMaintenanceRequest(res);
    }
  };
}

function rejectMaintenanceRequest(res: Response): void {
  res.status(401).json({
    error: {
      code: 'maintenance_unauthenticated',
      message: 'Accesso negato',
    },
  });
}

export const requireMaintenanceOidc = createMaintenanceOidcMiddleware();

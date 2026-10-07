import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyAuthenticationResponse, type AuthenticationResponseJSON } from '@simplewebauthn/server';

const b64url = (bytes: Buffer) => bytes.toString('base64url');
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest();

describe('passkey ES256 verification', () => {
  it('verifies a signed assertion with the same ASN.1 parser used by the authenticator key', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    const x = Buffer.from(jwk.x!, 'base64url');
    const y = Buffer.from(jwk.y!, 'base64url');
    // COSE EC2 key: kty=2, alg=-7 (ES256), crv=1 (P-256), x and y.
    const cosePublicKey = Buffer.concat([
      Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
      x,
      Buffer.from([0x22, 0x58, 0x20]),
      y,
    ]);
    const rpId = 'example.com';
    const origin = `https://${rpId}`;
    const challenge = b64url(randomBytes(32));
    const credentialId = b64url(randomBytes(16));
    const clientDataJSON = Buffer.from(JSON.stringify({
      type: 'webauthn.get',
      challenge,
      origin,
      crossOrigin: false,
    }));
    // rpIdHash + user-present/user-verified flags + signature counter.
    const authenticatorData = Buffer.concat([
      sha256(rpId),
      Buffer.from([0x05, 0, 0, 0, 1]),
    ]);
    const signature = sign('sha256', Buffer.concat([
      authenticatorData,
      sha256(clientDataJSON),
    ]), privateKey);
    const response: AuthenticationResponseJSON = {
      id: credentialId,
      rawId: credentialId,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        authenticatorData: b64url(authenticatorData),
        clientDataJSON: b64url(clientDataJSON),
        signature: b64url(signature),
      },
    };

    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      requireUserVerification: true,
      credential: {
        id: credentialId,
        publicKey: cosePublicKey,
        counter: 0,
        transports: [],
      },
    });

    expect(result.verified).toBe(true);
    expect(result.authenticationInfo.newCounter).toBe(1);
  });
});
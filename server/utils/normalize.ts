export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function generateClienteIdFromEmail(email: string): string {
  const normalized = normalizeEmail(email);
  return Buffer.from(normalized).toString("base64url");
}

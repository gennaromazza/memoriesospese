import { createHash } from 'node:crypto';

export const INFO_FORM_PLACES_MAX_REQUESTS = 120;
export const INFO_FORM_PLACES_WINDOW_MS = 10 * 60_000;
const MAX_TRACKED_TOKENS = 10_000;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export type InfoFormPlacesRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface InfoFormPlacesRateLimiter {
  check(token: string, now?: number): InfoFormPlacesRateLimitResult;
  consume(token: string, now?: number): InfoFormPlacesRateLimitResult;
}

/**
 * Fixed-window per bearer token, shared between autocomplete and details.
 * Only a digest of the bearer token is retained in memory.
 */
export function createInfoFormPlacesRateLimiter(options: {
  maxRequests?: number;
  windowMs?: number;
  maxTrackedTokens?: number;
} = {}) {
  const maxRequests = options.maxRequests ?? INFO_FORM_PLACES_MAX_REQUESTS;
  const windowMs = options.windowMs ?? INFO_FORM_PLACES_WINDOW_MS;
  const maxTrackedTokens = options.maxTrackedTokens ?? MAX_TRACKED_TOKENS;

  if (!Number.isInteger(maxRequests) || maxRequests < 1) {
    throw new Error('maxRequests must be a positive integer');
  }
  if (!Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error('windowMs must be a positive number');
  }
  if (!Number.isInteger(maxTrackedTokens) || maxTrackedTokens < 1) {
    throw new Error('maxTrackedTokens must be a positive integer');
  }

  const entries = new Map<string, RateLimitEntry>();
  let nextSweepAt = 0;

  const sweepExpired = (now: number) => {
    if (now >= nextSweepAt) {
      for (const [key, entry] of entries) {
        if (entry.resetAt <= now) entries.delete(key);
      }
      nextSweepAt = now + Math.min(windowMs, 60_000);
    }
  };

  const check = (token: string, now = Date.now()): InfoFormPlacesRateLimitResult => {
    sweepExpired(now);
    const key = createHash('sha256').update(token).digest('hex');
    const entry = entries.get(key);
    if (entry && entry.resetAt > now) {
      if (entry.count >= maxRequests) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
        };
      }
      return { allowed: true };
    }

    if (entries.size >= maxTrackedTokens) {
      let earliestResetAt = Number.POSITIVE_INFINITY;
      for (const [trackedKey, trackedEntry] of entries) {
        if (trackedEntry.resetAt <= now) {
          entries.delete(trackedKey);
        } else {
          earliestResetAt = Math.min(earliestResetAt, trackedEntry.resetAt);
        }
      }
      if (entries.size >= maxTrackedTokens) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((earliestResetAt - now) / 1000)),
        };
      }
    }

    return { allowed: true };
  };

  const consume = (token: string, now = Date.now()): InfoFormPlacesRateLimitResult => {
    const result = check(token, now);
    if (!result.allowed) return result;

    const key = createHash('sha256').update(token).digest('hex');
    let entry = entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      entries.set(key, entry);
    }
    entry.count += 1;
    return { allowed: true };
  };

  return { check, consume };
}
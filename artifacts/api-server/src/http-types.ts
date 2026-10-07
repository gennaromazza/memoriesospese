import type { Request, Response } from 'express';

/**
 * Existing Express handlers either return the sent response or finish after
 * sending it / calling next(). Express ignores that return value.
 * Keep the contract explicit without changing their response or control flow.
 */
export type HttpHandlerResult = Response | void;

/** Named `:param` segments are strings; wildcard routes must use Express Request. */
export type NamedParamsRequest = Request<Record<string, string>>;
import type { Express, Request, Response } from 'express';

export const LEGACY_IMAGE_EXPERIENCE_PATHS = ['/esperienza', '/esperienza/'] as const;

function redirectLegacyImageExperience(req: Request, res: Response): void {
  const queryStart = req.originalUrl.indexOf('?');
  const query = queryStart >= 0 ? req.originalUrl.slice(queryStart) : '';
  res.redirect(301, `/image-experience${query}`);
}

export function registerLegacyCampaignRoutes(app: Express): void {
  app.get([...LEGACY_IMAGE_EXPERIENCE_PATHS], redirectLegacyImageExperience);
}
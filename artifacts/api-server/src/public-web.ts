import express from 'express';
import { mountProductionClient } from './production-web';
import { logger } from './lib/logger';

// The public web service shares the renderer, not the API server's workers.
const port = Number(process.env.PORT);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error('A valid PORT is required for the public web service');
}

const app = express();
app.disable('x-powered-by');
mountProductionClient(app);
app.listen(port, '0.0.0.0', () => {
  logger.info({ port }, 'Public web server listening with page-specific HTML');
});

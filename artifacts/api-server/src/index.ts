import app from "./app";
import { logger } from "./lib/logger";
import {
  cleanupStaleJobs,
  startBulkEmailDispatcher,
  stopBulkEmailDispatcher,
} from "./bulk-email-routes";
import {
  runReminderCheck,
  runVisioneAutoInviteCheck,
} from "./reminder-routes";
import { runFollowUpCheck } from "./follow-up-routes";
import { runLabShipmentExpiryCheck } from "./lab-routes";
import { runPrintShopRetentionCleanup } from "./print-shop/router";
import { runGiftCardDeliveries } from "./gift-cards";
import { startCancellationRetryWorker } from "./workers/cancellation-retry";
import {
  startEventSyncWorker,
  stopEventSyncWorker,
} from "./sync/event-sync-guard";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

let cancellationWorkerCleanup: (() => void) | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let reminderInterval: NodeJS.Timeout | null = null;

const runScheduledMaintenance = async () => {
  const jobs = [
    runReminderCheck(),
    runVisioneAutoInviteCheck(),
    runLabShipmentExpiryCheck(),
    runPrintShopRetentionCleanup(),
    runGiftCardDeliveries(),
    runFollowUpCheck(),
  ];
  const results = await Promise.allSettled(jobs);
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error(
        { err: result.reason, jobIndex: index },
        "Scheduled maintenance job failed",
      );
    }
  });
};

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  cancellationWorkerCleanup = startCancellationRetryWorker();
  startEventSyncWorker(30);
  await cleanupStaleJobs();
  startBulkEmailDispatcher(30_000);
  cleanupInterval = setInterval(() => {
    void cleanupStaleJobs();
  }, 10 * 60 * 1000);
  setTimeout(() => void runScheduledMaintenance(), 2 * 60 * 1000);
  reminderInterval = setInterval(
    () => void runScheduledMaintenance(),
    60 * 60 * 1000,
  );
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "Shutting down");
  cancellationWorkerCleanup?.();
  stopEventSyncWorker();
  stopBulkEmailDispatcher();
  if (cleanupInterval) clearInterval(cleanupInterval);
  if (reminderInterval) clearInterval(reminderInterval);
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

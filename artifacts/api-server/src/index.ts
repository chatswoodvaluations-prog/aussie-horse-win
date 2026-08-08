import app from "./app";
import { logger } from "./lib/logger";
import { db, tracksTable } from "@workspace/db";
import { seed, migrateNewTracks } from "./lib/seed";
import { schedule } from "node-cron";

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

/**
 * Trigger an internal sync by POSTing to our own /api/sync endpoint.
 * Using fetch rather than calling the route handler directly keeps the
 * request lifecycle (logging, error handling) consistent with manual syncs.
 */
async function triggerScheduledSync(): Promise<void> {
  logger.info("Cron: starting scheduled sync");
  try {
    const resp = await fetch(`http://localhost:${port}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const body = await resp.json();
    logger.info(body, "Cron: scheduled sync complete");
  } catch (err) {
    logger.error({ err }, "Cron: scheduled sync failed");
  }
}

async function bootstrap() {
  // Auto-seed on first start if the DB is empty
  try {
    const tracks = await db.select().from(tracksTable);
    if (tracks.length === 0) {
      logger.info("Database empty, running seed...");
      await seed();
    } else {
      // Existing DB: add any tracks that are in the canonical list but missing
      await migrateNewTracks();
    }
  } catch (err) {
    logger.error({ err }, "Seed error (non-fatal)");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");

    // Schedule daily sync at 06:00 Australian Eastern Time (handles AEST/AEDT automatically)
    schedule(
      "0 6 * * *",
      () => {
        triggerScheduledSync().catch((err) => {
          logger.error({ err }, "Cron: unhandled error in triggerScheduledSync");
        });
      },
      { timezone: "Australia/Sydney" }
    );

    logger.info("Cron: daily sync scheduled for 06:00 Australia/Sydney");
  });
}

bootstrap();

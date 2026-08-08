import app from "./app";
import { logger } from "./lib/logger";
import { db, tracksTable } from "@workspace/db";
import { seed } from "./lib/seed";

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

async function bootstrap() {
  // Auto-seed on first start if the DB is empty
  try {
    const tracks = await db.select().from(tracksTable);
    if (tracks.length === 0) {
      logger.info("Database empty, running seed...");
      await seed();
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
  });
}

bootstrap();

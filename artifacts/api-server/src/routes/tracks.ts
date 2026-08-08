import { Router } from "express";
import { db, tracksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetTracksResponse } from "@workspace/api-zod";

const router = Router();

router.get("/tracks", async (req, res): Promise<void> => {
  const tracks = await db.select().from(tracksTable).orderBy(tracksTable.state, tracksTable.name);
  res.json(GetTracksResponse.parse(tracks));
});

export default router;

import { Router } from "express";
import { db, tracksTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetSettingsResponse, UpdateSettingsBody, UpdateSettingsResponse } from "@workspace/api-zod";

const router = Router();

router.get("/settings", async (req, res): Promise<void> => {
  const rows = await db.select().from(settingsTable).limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Settings not found" });
    return;
  }
  const s = rows[0];
  const result = {
    fieldSizeMin: s.fieldSizeMin,
    fieldSizeMax: s.fieldSizeMax,
    minWinOdds: s.minWinOdds,
    maxWinOdds: s.maxWinOdds,
    minPlaceOdds: s.minPlaceOdds,
    winStake: s.winStake,
    placeStake: s.placeStake,
    enabledTrackIds: JSON.parse(s.enabledTrackIds) as number[],
  };
  res.json(GetSettingsResponse.parse(result));
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid settings body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const rows = await db.select().from(settingsTable).limit(1);

  const updates: Record<string, unknown> = {};
  if (data.fieldSizeMin !== undefined) updates.fieldSizeMin = data.fieldSizeMin;
  if (data.fieldSizeMax !== undefined) updates.fieldSizeMax = data.fieldSizeMax;
  if (data.minWinOdds !== undefined) updates.minWinOdds = data.minWinOdds;
  if (data.maxWinOdds !== undefined) updates.maxWinOdds = data.maxWinOdds;
  if (data.minPlaceOdds !== undefined) updates.minPlaceOdds = data.minPlaceOdds;
  if (data.winStake !== undefined) updates.winStake = data.winStake;
  if (data.placeStake !== undefined) updates.placeStake = data.placeStake;
  if (data.enabledTrackIds !== undefined) {
    updates.enabledTrackIds = JSON.stringify(data.enabledTrackIds);
  }

  let updated;
  if (rows.length === 0) {
    // Create default settings
    [updated] = await db.insert(settingsTable).values({
      ...updates,
      enabledTrackIds: updates.enabledTrackIds as string ?? "[]",
    }).returning();
  } else {
    [updated] = await db
      .update(settingsTable)
      .set(updates)
      .where(eq(settingsTable.id, rows[0].id))
      .returning();
  }

  const result = {
    fieldSizeMin: updated.fieldSizeMin,
    fieldSizeMax: updated.fieldSizeMax,
    minWinOdds: updated.minWinOdds,
    maxWinOdds: updated.maxWinOdds,
    minPlaceOdds: updated.minPlaceOdds,
    winStake: updated.winStake,
    placeStake: updated.placeStake,
    enabledTrackIds: JSON.parse(updated.enabledTrackIds) as number[],
  };
  res.json(UpdateSettingsResponse.parse(result));
});

export default router;

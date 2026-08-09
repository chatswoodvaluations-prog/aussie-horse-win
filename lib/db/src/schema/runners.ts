import { pgTable, text, serial, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const runnersTable = pgTable("runners", {
  id: serial("id").primaryKey(),
  raceId: integer("race_id").notNull(),
  horseName: text("horse_name").notNull(),
  barrierNumber: integer("barrier_number").notNull(),
  speedMapPosition: text("speed_map_position").notNull(), // Lead, On-Pace, Handy, Midfield, Back-Marker
  winOdds: real("win_odds").notNull(),
  placeOdds: real("place_odds").notNull(),
  /** Ladbrokes fixed-odds win price — null when not available */
  ladbrokesWinOdds: real("ladbrokes_win_odds"),
  /** Ladbrokes fixed-odds place price — null when not available */
  ladbrokesPlaceOdds: real("ladbrokes_place_odds"),
  jockey: text("jockey"),
  trainer: text("trainer"),
  passed: boolean("passed").notNull().default(false),
  filterResults: text("filter_results").notNull().default("[]"), // JSON string of FilterResult[]
});

export const insertRunnerSchema = createInsertSchema(runnersTable).omit({ id: true });
export type InsertRunner = z.infer<typeof insertRunnerSchema>;
export type Runner = typeof runnersTable.$inferSelect;

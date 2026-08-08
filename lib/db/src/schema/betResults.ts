import { pgTable, text, serial, integer, real, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const betResultsTable = pgTable("bet_results", {
  id: serial("id").primaryKey(),
  nominationId: integer("nomination_id").notNull(),
  raceId: integer("race_id").notNull(),
  runnerId: integer("runner_id").notNull(),
  trackName: text("track_name").notNull(),
  raceDate: date("race_date", { mode: "string" }).notNull(),
  horseName: text("horse_name").notNull(),
  finishPosition: integer("finish_position").notNull(),
  fieldSize: integer("field_size").notNull(),
  winStake: real("win_stake").notNull(),
  placeStake: real("place_stake").notNull(),
  totalOutlay: real("total_outlay").notNull(),
  actualWinReturn: real("actual_win_return"),
  actualPlaceReturn: real("actual_place_return"),
  netResult: real("net_result").notNull(),
  outcome: text("outcome").notNull(), // Won, Placed, Unplaced
});

export const insertBetResultSchema = createInsertSchema(betResultsTable).omit({ id: true });
export type InsertBetResult = z.infer<typeof insertBetResultSchema>;
export type BetResult = typeof betResultsTable.$inferSelect;

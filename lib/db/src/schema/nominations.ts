import { pgTable, text, serial, integer, real, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nominationsTable = pgTable("nominations", {
  id: serial("id").primaryKey(),
  raceId: integer("race_id").notNull(),
  runnerId: integer("runner_id").notNull(),
  trackName: text("track_name").notNull(),
  state: text("state").notNull(),
  raceNumber: integer("race_number").notNull(),
  raceName: text("race_name"),
  raceDate: date("race_date", { mode: "string" }).notNull(),
  raceTime: text("race_time"),
  horseName: text("horse_name").notNull(),
  barrierNumber: integer("barrier_number").notNull(),
  speedMapPosition: text("speed_map_position").notNull(),
  winOdds: real("win_odds").notNull(),
  placeOdds: real("place_odds").notNull(),
  winStake: real("win_stake").notNull().default(5),
  placeStake: real("place_stake").notNull().default(20),
  totalOutlay: real("total_outlay").notNull().default(25),
  projectedWinReturn: real("projected_win_return").notNull(),
  projectedPlaceReturn: real("projected_place_return").notNull(),
  jockey: text("jockey"),
  trainer: text("trainer"),
  status: text("status").notNull().default("Pending"), // Pending, Won, Placed, Unplaced
});

export const insertNominationSchema = createInsertSchema(nominationsTable).omit({ id: true });
export type InsertNomination = z.infer<typeof insertNominationSchema>;
export type Nomination = typeof nominationsTable.$inferSelect;

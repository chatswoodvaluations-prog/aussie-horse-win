import { pgTable, text, serial, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const racesTable = pgTable("races", {
  id: serial("id").primaryKey(),
  trackId: integer("track_id").notNull(),
  trackName: text("track_name").notNull(),
  state: text("state").notNull(),
  raceNumber: integer("race_number").notNull(),
  raceName: text("race_name"),
  raceDate: date("race_date", { mode: "string" }).notNull(),
  raceTime: text("race_time"),
  fieldSize: integer("field_size").notNull(),
  distance: integer("distance"),
  dataSource: text("data_source").$type<"live" | "mock">().notNull().default("mock"),
});

export const insertRaceSchema = createInsertSchema(racesTable).omit({ id: true });
export type InsertRace = z.infer<typeof insertRaceSchema>;
export type Race = typeof racesTable.$inferSelect;

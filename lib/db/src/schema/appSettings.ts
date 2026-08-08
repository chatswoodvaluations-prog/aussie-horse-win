import { pgTable, text, serial, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(), // JSON-encoded value
});

// Settings will be stored as individual key-value rows, but we define a helper table
// For the singleton settings record, we'll use a single JSON blob
export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  fieldSizeMin: integer("field_size_min").notNull().default(8),
  fieldSizeMax: integer("field_size_max").notNull().default(11),
  minWinOdds: real("min_win_odds").notNull().default(5.0),
  maxWinOdds: real("max_win_odds").notNull().default(10.0),
  minPlaceOdds: real("min_place_odds").notNull().default(1.85),
  winStake: real("win_stake").notNull().default(5.0),
  placeStake: real("place_stake").notNull().default(20.0),
  enabledTrackIds: text("enabled_track_ids").notNull().default("[]"), // JSON array of IDs
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type AppSettings = typeof settingsTable.$inferSelect;

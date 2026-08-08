import { pgTable, text, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tracksTable = pgTable("tracks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  state: text("state").notNull(), // VIC or NSW
  type: text("type").notNull(), // Regional or Provincial
  enabled: boolean("enabled").notNull().default(true),
});

export const insertTrackSchema = createInsertSchema(tracksTable).omit({ id: true });
export type InsertTrack = z.infer<typeof insertTrackSchema>;
export type Track = typeof tracksTable.$inferSelect;

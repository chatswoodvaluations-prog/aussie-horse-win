import nodemailer from "nodemailer";
import { logger } from "./logger";

export interface NominationSummaryRow {
  track: string;
  raceNumber: number;
  raceName: string;
  raceDate: string;
  raceTime: string;
  horseName: string;
  barrierNumber: number;
  winOdds: number;
  placeOdds: number;
  winStake: number;
  placeStake: number;
}

/** Build a plain-text summary of new nominations */
function buildPlainText(rows: NominationSummaryRow[]): string {
  const lines = [
    "🐴 Aussie Horse Win — New Qualifying Selections",
    "=".repeat(50),
    "",
    `${rows.length} new nomination${rows.length !== 1 ? "s" : ""} found:`,
    "",
  ];

  for (const r of rows) {
    lines.push(
      `Track:    ${r.track}`,
      `Race:     R${r.raceNumber} — ${r.raceName} (${r.raceDate} ${r.raceTime})`,
      `Horse:    ${r.horseName}  (Barrier ${r.barrierNumber})`,
      `Odds:     Win $${r.winOdds.toFixed(2)}  |  Place $${r.placeOdds.toFixed(2)}`,
      `Staking:  Win $${r.winStake.toFixed(2)}  |  Place $${r.placeStake.toFixed(2)}`,
      `Total outlay: $${(r.winStake + r.placeStake).toFixed(2)}`,
      "-".repeat(50),
    );
  }

  lines.push("", "— Aussie Horse Win Selection Engine");
  return lines.join("\n");
}

/** Build an HTML summary of new nominations */
function buildHtml(rows: NominationSummaryRow[]): string {
  const rowsHtml = rows
    .map(
      (r) => `
      <tr style="border-bottom:1px solid #334155;">
        <td style="padding:10px 8px;font-weight:600;">${r.track}</td>
        <td style="padding:10px 8px;">R${r.raceNumber}<br/><span style="font-size:12px;color:#94a3b8;">${r.raceName}</span></td>
        <td style="padding:10px 8px;">${r.raceDate}<br/><span style="font-size:12px;color:#94a3b8;">${r.raceTime}</span></td>
        <td style="padding:10px 8px;font-weight:600;">${r.horseName}<br/><span style="font-size:12px;color:#94a3b8;">Barrier ${r.barrierNumber}</span></td>
        <td style="padding:10px 8px;font-family:monospace;">$${r.winOdds.toFixed(2)}<br/><span style="font-size:12px;color:#94a3b8;">Place $${r.placeOdds.toFixed(2)}</span></td>
        <td style="padding:10px 8px;font-family:monospace;color:#22c55e;">$${(r.winStake + r.placeStake).toFixed(2)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:32px auto;background:#1e293b;border-radius:12px;overflow:hidden;">
    <tr><td style="background:#1e3a5f;padding:24px 32px;">
      <p style="margin:0;font-size:12px;letter-spacing:2px;color:#60a5fa;font-weight:700;text-transform:uppercase;">Aussie Horse Win</p>
      <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;">🐴 New Qualifying Selections</h1>
    </td></tr>
    <tr><td style="padding:24px 32px;">
      <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;">${rows.length} new nomination${rows.length !== 1 ? "s" : ""} passed all 5 filters:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;">
        <thead>
          <tr style="background:#0f172a;color:#60a5fa;font-size:11px;text-transform:uppercase;letter-spacing:1px;">
            <th style="padding:8px;text-align:left;">Track</th>
            <th style="padding:8px;text-align:left;">Race</th>
            <th style="padding:8px;text-align:left;">Date</th>
            <th style="padding:8px;text-align:left;">Horse</th>
            <th style="padding:8px;text-align:left;">Odds</th>
            <th style="padding:8px;text-align:left;">Outlay</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </td></tr>
    <tr><td style="padding:16px 32px 24px;color:#475569;font-size:12px;border-top:1px solid #334155;">
      Aussie Horse Win Selection Engine — automated alert
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Send an email alert for new nominations.
 *
 * Reads SMTP config from environment variables:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * If any required variable is absent the email is skipped and the content
 * is logged instead — the sync itself is never blocked by email failures.
 */
export async function sendNominationAlert(
  toEmail: string,
  rows: NominationSummaryRow[],
): Promise<void> {
  if (rows.length === 0) return;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user ?? "noreply@example.com";

  if (!host || !user || !pass) {
    logger.info(
      { toEmail, count: rows.length },
      "Email alert skipped — SMTP not configured (SMTP_HOST / SMTP_USER / SMTP_PASS). " +
        "Set these env vars to enable outbound email.",
    );
    logger.info({ body: buildPlainText(rows) }, "Email alert content (preview)");
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from,
      to: toEmail,
      subject: `🐴 ${rows.length} new qualifying selection${rows.length !== 1 ? "s" : ""} found — Aussie Horse Win`,
      text: buildPlainText(rows),
      html: buildHtml(rows),
    });
    logger.info({ toEmail, count: rows.length }, "Nomination alert email sent");
  } catch (err) {
    // Log but don't throw — email failure must never break the sync response
    logger.error({ err, toEmail }, "Failed to send nomination alert email");
  }
}

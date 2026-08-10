/**
 * Ladbrokes Relay Worker
 *
 * Proxies requests to api.ladbrokes.com.au through Cloudflare's edge network.
 * Cloudflare edge IPs are not blocked by Ladbrokes the way datacenter IPs are.
 *
 * Deploy once, then set LADBROKES_RELAY_URL in your API server env.
 *
 * Authentication: set the RELAY_KEY secret via `wrangler secret put RELAY_KEY`
 * and the same value as LADBROKES_RELAY_KEY in the API server env.
 * If RELAY_KEY is not set in the worker, auth is disabled (fine for private use).
 */

const LADBROKES_API = "https://api.ladbrokes.com.au";

// Headers that make the request look like a real Australian mobile browser
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-AU,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.ladbrokes.com.au/",
  Origin: "https://www.ladbrokes.com.au",
};

export default {
  async fetch(request, env) {
    // ── CORS preflight ────────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "X-Relay-Key",
        },
      });
    }

    // ── Auth check (optional — only enforced when RELAY_KEY secret is set) ───
    if (env.RELAY_KEY) {
      const provided = request.headers.get("X-Relay-Key");
      if (provided !== env.RELAY_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // ── Build the target Ladbrokes URL ────────────────────────────────────────
    const url = new URL(request.url);
    const targetUrl = `${LADBROKES_API}${url.pathname}${url.search}`;

    // ── Proxy the request ─────────────────────────────────────────────────────
    let ladsResponse;
    try {
      ladsResponse = await fetch(targetUrl, {
        method: "GET",
        headers: BROWSER_HEADERS,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Relay fetch failed", detail: String(err) }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── Pass through the response ─────────────────────────────────────────────
    const body = await ladsResponse.text();
    const contentType =
      ladsResponse.headers.get("Content-Type") || "application/json";

    return new Response(body, {
      status: ladsResponse.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        // Surface the real Ladbrokes status so the fetcher can log it
        "X-Ladbrokes-Status": String(ladsResponse.status),
      },
    });
  },
};

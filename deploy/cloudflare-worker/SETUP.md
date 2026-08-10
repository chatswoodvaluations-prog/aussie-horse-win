# Ladbrokes Relay — Cloudflare Worker Setup

This worker proxies requests to `api.ladbrokes.com.au` through Cloudflare's
edge network, bypassing the IP blocks that affect datacenter servers.

---

## Step 1 — Create a free Cloudflare account

Go to **https://cloudflare.com** → click **Sign Up** → choose the **Free** plan.
No credit card required.

---

## Step 2 — Create the Worker (in-browser, no CLI needed)

1. In the Cloudflare dashboard, click **Workers & Pages** in the left sidebar.
2. Click **Create** → **Create Worker**.
3. Give it any name, e.g. `ladbrokes-relay`.
4. Click **Deploy** (ignore the placeholder code for now).
5. Click **Edit code** (top-right of the worker page).
6. **Select all** the placeholder code and **delete it**.
7. **Paste** the entire contents of `deploy/cloudflare-worker/src/index.js` from this repo.
8. Click **Deploy** (top-right of the editor).

You will see a URL like:
```
https://ladbrokes-relay.YOUR-ACCOUNT.workers.dev
```

**Copy that URL** — you will need it in the next step.

---

## Step 3 — Add the relay URL to Replit

1. In Replit, open **Secrets** (the padlock icon in the sidebar).
2. Add a new secret:
   - **Key:** `LADBROKES_RELAY_URL`
   - **Value:** the worker URL from Step 2  
     e.g. `https://ladbrokes-relay.your-account.workers.dev`
3. Save.

The API server reads this env var on startup. No code changes needed.

---

## Step 4 — Restart the API server and test

In the Replit workflow panel, restart **API Server**.

Then trigger a sync and check the result:

```bash
curl -s -X POST http://localhost:8080/api/sync | python3 -m json.tool
```

If `"source"` is `"ladbrokes"` and `racesAdded` is greater than 0, it worked.
If `liveError` appears in the response, the worker URL needs checking.

---

## Step 5 — Add to Oracle (optional, if still using Oracle)

Add the env var to `/home/ubuntu/aussie-horse-win/.env.production`:

```
LADBROKES_RELAY_URL=https://ladbrokes-relay.your-account.workers.dev
```

Then run:
```bash
cd ~/aussie-horse-win && bash deploy/fix-pm2.sh
```

---

## Optional — Add auth to the worker

If you want to prevent others from using your relay:

1. In Cloudflare dashboard → your worker → **Settings** → **Variables** → **Secrets**.
2. Add a secret named `RELAY_KEY` with any random string value.
3. Add the same value as `LADBROKES_RELAY_KEY` in Replit Secrets (and in Oracle's `.env.production`).

The worker will then reject requests without the correct key.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `liveError: "... no meetings found"` | Worker URL is wrong or worker not deployed |
| `liveError: "HTTP 401"` | RELAY_KEY mismatch between worker and API server |
| `liveError: "HTTP 403"` | Ladbrokes is blocking Cloudflare edge IPs too — try residential proxy |
| `source: "ladbrokes"` but `racesAdded: 0` | No races available for the requested dates/states yet |

# Trades Cloud — setup

One cloud for all three companies. AGA, APS and APC keep their quotes in the
same Supabase project, distinguished by a `trade` column rather than by
separate databases, so the group can be reported on as a whole.

This document is the part that cannot be done from the code: creating the
tables and deploying the function both need your Supabase account.

**Current state:** the config is filled in and the apps are wired to it. Until
the two steps below are run, the cloud buttons are visible but every request
fails — the function does not exist yet.

---

## What you need

- The Supabase project AGA already uses: `mvymxqajdiupucrkeqpg`
- The [Supabase CLI](https://supabase.com/docs/guides/cli), logged in
- This repository checked out

---

## Step 1 — create the tables

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the whole of `supabase/trades-schema.sql` and click **Run**.

You should see *Success. No rows returned*. That creates three tables:

| Table | Holds |
| --- | --- |
| `trade_quotes` | every saved quote, one row each, with a `trade` column |
| `trade_settings` | company details, one row per trade |
| `trade_prices` | the price list, one row per trade |

It is safe to run twice — everything is `create ... if not exists`.

**Check it worked:** in the Table Editor you should see all three tables, each
with Row Level Security **enabled**.

---

## Step 2 — deploy the function

From the repository root:

```bash
supabase functions deploy cloud --project-ref mvymxqajdiupucrkeqpg
```

No secrets to set. The function reads the database with the service role key
that Supabase provides to every function automatically.

**Check it worked:**

```bash
curl "https://mvymxqajdiupucrkeqpg.supabase.co/functions/v1/cloud?action=status" \
  -H "apikey: sb_publishable_U5wCUR1JeDskIqQdGwdAbg_zaczJYlJ"
```

You want `{"configured":true}`.

---

## Step 3 — open the apps and sign in

1. Open AGA, switch to **Plumbing** or **Construction**.
2. **Saved quotes** → the cloud buttons are already there.
3. Sign in with a Supabase auth user (see below).
4. **Upload this device's quotes** to push what is on that device up.

### Creating a user to sign in with

The apps exchange the email and password directly with Supabase Auth, so
create users there: **Authentication → Users → Add user**.

With open access (see below) any user you create can read and write every
trade's quotes.

---

## Access — currently open

Everyone has access everywhere, as agreed while the group gets running. There
is no sign-in *requirement* and the database policies allow any holder of the
anon key to read and write all three trades' rows. This matches the AGA app's
`ACCESS_MODE = "open"`.

**What that means in practice:** the anon key is public and sits in the page,
so anyone with the site URL can reach the quote data through the API. That is
fine for getting the workshop running. It is not fine once the data is
commercially sensitive.

### To lock it down later

`supabase/trades-schema.sql` carries a marked section with ready-to-run SQL
that:

1. requires sign-in, so the anon key alone is not enough; and
2. confines each trade to its own quotes, so the plumbing app can never read
   the coatings book.

That second step needs each staff login to carry a `trade` value in its user
metadata. The SQL in the schema comments shows the exact policy.

---

## How the trades stay apart

Every quote is stamped with its trade on the way in and filtered by it on the
way out:

| App | Sends | Sees |
| --- | --- | --- |
| Plumbing (APS) | `&trade=aps` | `aps` quotes only |
| Construction (APC) | `&trade=apc` | `apc` quotes only |

The function rejects a request with no trade rather than guessing, so a quote
can never be filed into a book no app would read back.

**This keeps the apps apart, not the people.** With open access, anyone who
can reach the API can read all three books — the separation is about which
screen shows what, not about who is allowed what. Sign-in plus the per-trade
policy above is what turns it into real separation.

---

## Company settings and the price list

Shared per trade, not per user, so two staff cannot quote the same job at
different rates. The first device to press **Upload this device's quotes**
also pushes its settings and price list; every other device picks them up on
next sync.

---

## If something is wrong

| Symptom | Likely cause |
| --- | --- |
| Buttons appear, every call fails with a CORS error | the function is not deployed — step 2 |
| `{"configured":false}` | the function deployed but `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are missing from its environment |
| "Cloud is not set up yet" in the app | `trades/*/config.js` has a blank URL or key |
| Quotes save but never sync | signed in? and has **Upload this device's quotes** been pressed once? |
| `Unknown or missing trade.` | the deployed function is older than this repo — redeploy |

---

## What this does NOT cover

**AGA's own data.** The window/door production records use `supabase/schema.sql`
and are untouched by any of this. Only the quoting side is shared.

**Google Drive.** APC still has an optional `APC_DRIVE_FUNCTION_URL` for a
shared Drive folder, separate from the cloud above and left blank. See
`supabase/SETUP-DRIVE.md` if you want it.

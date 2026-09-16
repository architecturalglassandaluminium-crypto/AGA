# AGA Email Setup (GitHub Pages + Supabase)

The app runs on **GitHub Pages**, which serves static files only. It
cannot run a serverless function, so the mailer lives as a **Supabase
Edge Function** and the page calls it over HTTPS.

Everything below is a one-time setup. Budget about 20 minutes.

---

## Why it works this way

A browser cannot hold a secret. Anything in the page source is readable
by every visitor, so a Resend API key in `email.js` would be public
within minutes of going live.

So the key lives in a Supabase Edge Function, on Supabase's servers.
The page sends the message to the function; the function adds the key
and forwards it to Resend.

```
GitHub Pages (static)          Supabase Edge Function        Resend
  browser  ──POST message──►   adds RESEND_API_KEY   ──►   sends email
                                     (secret lives here)
```

---

## Step 1 — Install the Supabase CLI

Pick one:

```bash
npm install -g supabase
```

The CLI is also available via Scoop, Homebrew and `npx supabase`.

Confirm it works:

```bash
supabase --version
```

## Step 2 — Log in and link the project

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
```

`YOUR-PROJECT-REF` is the subdomain of your Supabase project URL:

```
https://abcdefghijklm.supabase.co
         └───── this part ─────┘
```

Not sure? Run `supabase projects list` and read the `REFERENCE ID`
column.

## Step 3 — Set the three secrets

**This is the step where your Resend key is used. Do not put it in any
file that gets committed.**

```bash
supabase secrets set RESEND_API_KEY=re_your_key_here
```

The sender address must be a domain you have **verified in Resend**.
Resend refuses to send from an unverified domain, and that failure
surfaces as an error from this function:

```bash
supabase secrets set AGA_MAIL_FROM="AGA Workshop <no-reply@agasouthafrica.co.za>"
```

The allowed origin pins the function to your site. Without it, any
other website could use your function as a free mail relay:

```bash
supabase secrets set AGA_ALLOWED_ORIGIN="https://architecturalglassandaluminium-crypto.github.io"
```

You can see what is set (names only, never values):

```bash
supabase secrets list
```

## Step 4 — Deploy the function

From the repository root, where `supabase/functions/` lives:

```bash
supabase functions deploy send-production-email
```

If it asks about a JWT, **choose no** — the function is called straight
from a browser with the public anon key, and it does its own secret
handling.

The command prints the function URL:

```
https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-production-email
```

## Step 5 — Point the app at it

Open `email.js` and set the project ref near the top:

```js
const SUPABASE_PROJECT_REF = "YOUR-PROJECT-REF";
```

Commit and push. GitHub Pages redeploys automatically.

While the ref still reads `<PROJECT-REF>`, the app has no mailer: every
send returns `false` and falls back to a `mailto:` draft. That is
intentional — a missing mailer must never block the workshop.

## Step 6 — Check it works

Open your site, open a project, and press **Email**. It should report
that the project and its worksheet were sent.

If it does not, work down this list:

| What you see | What it means |
|---|---|
| "Email is not configured" | `RESEND_API_KEY` or `AGA_MAIL_FROM` is not set. Redo step 3. |
| Sends nothing, no message | `SUPABASE_PROJECT_REF` is still the placeholder. Redo step 5. |
| "Opened your mail app…" | The fallback fired, so the function refused or was unreachable. Check the browser console and the Supabase function logs. |
| Error about the sender domain | `AGA_MAIL_FROM` uses a domain not verified in Resend. |
| CORS error in the console | `AGA_ALLOWED_ORIGIN` does not match your site exactly (note: no trailing slash). |

Function logs, which show the real failure, are at:

```
Supabase dashboard → Edge Functions → send-production-email → Logs
```

---

## Security notes

- **Never commit the Resend key.** It is not in this repo, and it should
  never be. If it is ever exposed, revoke it in the Resend dashboard and
  set a new one with `supabase secrets set`.
- **The Supabase anon key is public by design.** It is shipped in
  `supabase-config.js` and only routes the function call. What protects
  your data is Row Level Security in `supabase/schema.sql`.
- **`AGA_ALLOWED_ORIGIN` matters.** It stops another site from relaying
  mail through your function. Set it to your real site, not `*`.
- **This function does not read or write workshop data.** It takes a
  message and forwards it, nothing more.

---

## The Netlify function

`netlify/functions/send-production-email.js` is kept for reference and
still works if the app is ever hosted on Netlify, where it needs no
CORS and no `SUPABASE_PROJECT_REF`. On GitHub Pages it is inert.

The two files do the same job. **If you change the email logic, change
both** — otherwise the Netlify copy will drift out of step and surprise
whoever deploys it next.
---

# Method 2 — Supabase website only (no CLI)

Use this if you would rather not install anything. Everything happens
in the Supabase dashboard.

## Step 1 — Set the secrets first

**Secrets → Add new secret** (or *Project Settings → Edge Functions →
Secrets*). Add all three:

| Name | Value |
|---|---|
| `RESEND_API_KEY` | `re_your_key_here` — from resend.com/api-keys |
| `AGA_MAIL_FROM` | `AGA Workshop <no-reply@agasouthafrica.co.za>` |
| `AGA_ALLOWED_ORIGIN` | `https://architecturalglassandaluminium-crypto.github.io` |

`AGA_MAIL_FROM` must use a domain **verified in Resend**, or Resend
refuses to send.

## Step 2 — Create the function

1. **Edge Functions → Deploy a new function**
2. Name it exactly: `send-production-email`
3. Choose any template — it will be replaced
4. Delete the template code and paste **everything** from
   `supabase/DASHBOARD-PASTE.ts`
5. Press **Deploy**

Wait for the success message. Your function now lives at:

```
https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-production-email
```

## Step 3 — Test it in the dashboard

On the function's page press **Test** and send:

- **Method:** POST
- **Header:** `Content-Type: application/json`
- **Body:**

```json
{
  "to": "your.own@email.com",
  "subject": "AGA test",
  "html": "<p>Testing the AGA mailer.</p>"
}
```

You should get `200` with `{"success":true,...}` and receive the email.

If you get `501`, the secrets are not set — go back to step 1.
If you get `502` with a message about the sender, the `AGA_MAIL_FROM`
domain is not verified in Resend.

## Step 4 — Point the app at it

In `email.js`, replace `<PROJECT-REF>`:

```js
const SUPABASE_PROJECT_REF = "YOUR-PROJECT-REF";
```

Your project ref is the subdomain of your Supabase project URL —
`https://abcdefghijklm.supabase.co` means the ref is `abcdefghijklm`.
You can also see it in the dashboard URL.

Commit and push. GitHub Pages redeploys automatically.

## Step 5 — Confirm

Open your site, open a project, press **Email**. It should say the
project and its worksheet were sent.

---

## A warning about the dashboard editor

Supabase's dashboard editor has **no version control, no history and no
rollback** — editing there overwrites what is deployed with no way back.

So keep `supabase/DASHBOARD-PASTE.ts` in the repo as the real copy. If
you need to change the email logic:

1. Edit the file in the repo
2. Paste the whole thing into the dashboard again
3. Deploy

That way the repo stays the source of truth and a mistake in the
browser is always recoverable.

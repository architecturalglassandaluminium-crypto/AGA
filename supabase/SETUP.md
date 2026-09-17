# AGA Workshop — Backend Setup Guide

This sets up shared data so several people on their own phones all
work on the same jobs.

You do the account steps (they need your email and your authorisation).
Nothing here requires you to send anyone a password.

---

## Step 1 — Create the Supabase project

1. Go to <https://supabase.com> and sign up.
   **Use a business email the company controls long-term** — not a
   personal one. This account will own the workshop's data.

2. Create a new project.
   - Name: `aga-workshop`
   - Database password: let it generate one and **save it** somewhere safe
     (you will rarely need it, but losing it is painful)
   - Region: choose the one closest to you (e.g. `eu-central-1` for South Africa)

3. Wait for the project to finish provisioning (about 2 minutes).

---

## Step 2 — Create the database tables

1. In Supabase, open **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `supabase/schema.sql` from this project, copy **everything**, paste it in.
4. Click **Run**.

You should see "Success. No rows returned". That created all the tables,
security policies and the PIN functions.

---

## Step 3 — Get your two public keys

1. In Supabase, go to **Project Settings** → **API**.
2. Copy two values:

| Supabase field | Goes into |
| --- | --- |
| **Project URL** | `SUPABASE_URL` |
| **anon public** key | `SUPABASE_ANON_KEY` |

1. Open `supabase-config.js` in this project and paste them in:

```js
const SUPABASE_URL = "https://yourproject.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

> **Both of these are safe to be public.** The anon key is designed to ship
> in websites. Your data is protected by the Row Level Security from Step 2.
>
> **Never** paste the `service_role` key into that file. It bypasses all
> security and this file is served to every visitor.

---

## Step 4 — Find your workshop id

1. In Supabase **SQL Editor**, run:

```sql
select id from workshops;
```

1. Copy the id and paste it into `supabase-config.js`:

```js
const SUPABASE_WORKSHOP_ID = "paste-the-id-here";
```

(If you skip this, the app looks it up automatically — but setting it
saves a request on every load.)

---

## Step 5 — Add your staff

1. In Supabase, open **Table Editor** → `employees` → **Insert row**.
2. Add each person: `name` (e.g. Thabo Nkosi), `employee_number` (e.g. E-101).
   Leave `pin_hash` empty for now, and leave `workshop_id` as your workshop id.
3. Repeat for everyone.

> Do this even while access is open. Staff still choose their name when they
> scan, so every step is credited to the right person — which is what makes
> the productivity dashboard mean anything.

---

## Step 6 — Set up the notification emails (Netlify)

The app sends two office notifications automatically:

- **Window into production** — when a window first moves to
  `In Production`.
- **New project saved** — when a new project is created.

Both go to `tiffany@agasouthafrica.co.za` and
`jan@agasouthafrica.co.za` (set in `email.js`, `OFFICE_RECIPIENTS`).
The project card also has an **Email** button that sends the same
project summary on demand.

These are sent by a Netlify function (`netlify/functions/send-production-email.js`),
because a browser must never hold a mail-provider secret. Set up the
sender once:

1. Create a free account at <https://resend.com> and verify the
   sending domain (`agasouthafrica.co.za`), or use their test sender
   to try it.
2. Copy the API key (`re_...`).
3. In **Netlify → Site settings → Environment variables**, add:

   | Variable | Value |
   | --- | --- |
   | `RESEND_API_KEY` | `re_...` |
   | `AGA_MAIL_FROM` | `AGA Workshop <no-reply@agasouthafrica.co.za>` |

4. Redeploy. The emails start working immediately.

> **Until these are set, nothing breaks.** The function answers
> "not configured", the app logs it and carries on — projects still
> save and statuses still update. The Email button then opens a
> pre-filled draft in the device's own mail app instead, so it is
> never a dead end.

---

## Step 7 — Deploy
Commit and push as usual. GitHub Pages will publish the updated app,
and Netlify will deploy the functions.

Anyone with the link can now use the app. Their work is shared, and each
step is attributed to whichever employee they selected.

---

## Access is currently OPEN

The app is set to **open access** for now: no PIN, anyone with the link can
use it. This is deliberate, to get the workshop running quickly.

### What this means in practice

- **Anyone with the link can read and change your data.** Do not post the
  link publicly or put it on social media.
- **Anyone can record work as any employee** by picking that name from the
  dropdown. The productivity figures are only as trustworthy as the team.
- **The employee dropdown is still used**, so work is attributed properly
  when people are honest about who they are.

### How to lock it down later

When you are ready to require a PIN:

1. **Give each person a PIN.** For each employee, run in the SQL Editor
   (find the uuid in Table Editor → `employees` → `id`):

   ```sql
   select set_employee_pin('PASTE-EMPLOYEE-UUID-HERE', '1234');
   ```

   PINs must be 4–6 digits. They are stored as a bcrypt hash, so nobody —
   including you — can read them back. To reset one, run the same command
   again with a new PIN.

   Tell each person their PIN in person. **Do not** email or WhatsApp the list.

2. **Switch the app to PIN mode.** Open `supabase-config.js` and change:

   ```js
   const ACCESS_MODE = "open";   //  ->  "pin"
   ```

3. **Tighten the database.** `supabase/schema.sql` has a marked section
   explaining exactly which policies to replace so that writes require a
   valid session. Until you do this, someone who reads the anon key could
   still write directly to the database, bypassing the PIN screen.

Step 3 is the one people forget. The PIN screen stops honest mistakes; the
**database policies** are what actually protect the data.

---

## How it behaves day to day

**The badge in the header** tells you the state at a glance:

| Badge | Meaning |
| --- | --- |
| 🟢 **Saved** | Everything is uploaded |
| 🔵 **Saving...** | Uploading now |
| 🟡 **3 to save** | Waiting to upload — will go automatically |
| ⚪ **Offline** | No signal; work is safe on the phone |
| 🔴 **Not saved** | Upload failed; will retry |

**Poor signal in the workshop is fine.** The app keeps working, writes are
stored on the phone, and they upload automatically the moment signal
returns — including when the phone comes back into range.

**Two people can work at once.** Each save sends only what changed, so
moving two different windows at the same time cannot clash.

**Sign out** only when someone leaves the company or the phone changes
hands. Any queued work is pushed up before the session ends.

---

## Verifying it worked

Open the app on two phones:

1. On phone A, create a project with one window.
2. On phone B, pull down to refresh.
3. The project should appear on B within a second or two.

If it does not:

- Check the badge on both phones
- Check you are both on the same Wi-Fi or have signal
- In the browser console (on a computer) look for lines starting `AGA:`

---

## Checking that the cloud side is actually set up

There is a script that answers "is the backend really working?" in one
command. Run it from the project folder:

```bash
npm run check:cloud
```

It reports, in order:

1. whether `supabase-config.js` holds a well-formed URL and a
   **publishable** key (and shouts if a secret key ever ends up there);
2. whether the Supabase project is reachable with that key;
3. whether all six tables from `supabase/schema.sql` exist;
4. whether there is a workshop row to attach work to;
5. whether Supabase Storage is reachable, and how many buckets it has;
6. whether the `AGA_DRIVE_*` variables for the nightly export are set.

Exit code is `0` when the essential pieces are in place and `1` otherwise,
so it can be wired into a deploy step later.

### Read the Storage line carefully

The checker reports **"Storage is reachable and has no buckets"** — and
that is correct, not a problem. This app does **not** use Supabase Storage
buckets. Window photos are stored as base64 data-URL strings in the
`windows.photo` column (see `supabase/schema.sql`). No file in this
codebase calls `storage.from(...)` or creates a bucket.

That design is why the "free tier is enough" note below is true, and it is
also the thing to revisit first if photo volume grows.

### The failure this checker exists to catch

An un-migrated project fails in a way that looks like nothing is wrong.
`isBackendConfigured()` returns `true` as soon as the URL and key are
filled in, so the app believes it is online — but if the tables were never
created, every sync request 404s. The app does not raise an error; it
quietly keeps working on `localStorage`, and work simply never reaches the
cloud.

If that is what you are seeing, the fix is Step 2 of this guide: run
`supabase/schema.sql` in the SQL editor. The file is idempotent
(`create table if not exists`), so re-running it is safe.

---

## Important notes

- **Do not delete the Supabase project.** Deleting it deletes all workshop data.
- **The free tier is enough to start.** You would only need to pay if you
  store a very large number of photos.
- **Photos are the big storage item.** A few hundred window photos is fine on
  the free tier; thousands will need an upgrade.
- **Keep the database password safe.** It is the master key to everything.
- This is a workshop convenience login. It stops casual mistakes and
  misattributed work — it is not bank-grade security. The database
  policies are the real boundary.

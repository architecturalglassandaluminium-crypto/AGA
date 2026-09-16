# Spreadsheets and Google Drive

How the background spreadsheet works, and the one thing left for you
to decide.

---

## How it works now

**There is no export button in the app.** The workshop never sees this
and never has to think about it. The spreadsheet is built and sent to
Drive on a schedule, in the background.

```
   +-----------------+
   |  The app        |   workshop uses it: measure, scan,
   |  (on the phone) |   allocate, quality check
   +--------+--------+
            |  syncs in the background
            v
   +-----------------+
   |  Supabase       |   the shared workshop data
   +--------+--------+
            |  read once a night
            v
   +-----------------+
   | drive-export.js |   builds the spreadsheet,
   | (office PC)     |   uploads it to Drive
   +--------+--------+
            v
   +-----------------+
   |  Google Drive   |   AGA-everything-2026-09-15.csv
   +-----------------+
```

Three pieces, and only the last one is unfinished:

| Piece | State |
| --- | --- |
| `export.js` - builds the spreadsheet | **done, 14/14 checks passing** |
| `drive-export.js` - the background job | **done** |
| Google service account key + folder | **needs you** - see below |

---

## Why the spreadsheet is built in the browser code, not on the server

`export.js` holds the sheet definitions and `drive-export.js` loads that
same file and runs it in Node. One definition of "what a window row
looks like", used by both - so the nightly spreadsheet can never drift
away from what the app means.

To make that possible, `export.js` touches nothing on the page: no
buttons, no DOM. It reads the data and returns CSV text. Whatever is
doing the delivering decides where the text goes.

---

## What is in the spreadsheet

One file, four sections:

| Section | One row per | Key columns |
| --- | --- | --- |
| Windows & Doors | every window/door | ID, project, customer, site, item, description, location, length, width, frame colour, glass type, status, allocated to, manufactured by, quality check, checked by, created |
| Projects | every project | number, name, customer, email, phone, site, item count, installed count, created |
| Productivity | every recorded step | when, employee, step, window ID, project, description |
| Team | every employee | number, name, role, active, steps recorded, last step recorded |

### Details that matter in the workshop

- **Excel opens it correctly on Windows.** Written with a UTF-8
  byte-order mark, so Afrikaans and Zulu names, and the squared sign in
  "per m2", do not turn into rubbish.
- **No formula injection.** A customer saved as `=Smith & Co` exports
  as `'=Smith & Co`. Without that Excel would try to *execute* it.
  Phone numbers starting with `+` and descriptions starting with `-`
  are handled the same way.
- **Commas and quotes survive.** `12 Main Rd, Krugersdorp, 1739` is
  quoted properly and stays in one cell.
- **Photos are left out on purpose.** A window photo is a data URL that
  would add hundreds of thousands of characters to one cell. The sheet
  is about the numbers.
- **Supabase's own column names work.** The job converts
  `length_mm` / `window_number` / `created_at` into what the sheet
  expects, verified against rows shaped exactly like PostgREST returns
  them.
- **An empty workshop uploads nothing.** It does not put an empty file
  in Drive every night.
- **It reads only.** The job has no write access to workshop data, so
  it cannot damage anything.

---

## What you need to set up (one time, about 15 minutes)

This is the only part I could not do for you: it needs access to the
company's Google account.

### 1. Create a service account

1. Go to https://console.cloud.google.com and create a project called
   `aga-export`.
2. **APIs & Services -> Library**, search for **Google Drive API**,
   click **Enable**.
3. **APIs & Services -> Credentials -> Create credentials -> Service
   account**. Name it `aga-export`.
4. Open the service account -> **Keys** -> **Add key -> Create new key
   -> JSON**. A `.json` file downloads.
5. Note the service account's email address - it looks like
   `aga-export@aga-export-123456.iam.gserviceaccount.com`.

### 2. Share the Drive folder with it

1. In Google Drive, create the folder you want the sheet to land in -
   for example **AGA Workshop Reports**.
2. Right-click it -> **Share** -> paste the service account's email ->
   give it **Editor** -> **Send**.
3. Copy the folder id from the URL. In
   `drive.google.com/drive/folders/1AbCdEfGh...`, the id is the part
   after `/folders/`.

This step is the one people forget. Without it the upload fails with
*"File not found"*, which sounds like a Drive problem but is really a
sharing problem.

### 3. Put the key on the office PC

Move the downloaded `.json` somewhere it will not be deleted, such as
`C:\aga\drive-key.json`. **Do not** commit it to this repository and do
not put it anywhere the website can read.

### 4. Set the environment and run it

```bat
set AGA_DRIVE_KEY=C:\aga\drive-key.json
set AGA_DRIVE_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz
set AGA_SUPABASE_URL=https://yourproject.supabase.co
set AGA_SUPABASE_ANON_KEY=eyJhbGciOi...

node drive-export.js
```

A successful run prints lines like:

```
--- AGA spreadsheet export started ---
Read from Supabase: 4 projects, 37 windows, 112 work records.
Authenticated as aga-export@aga-export-123456.iam.gserviceaccount.com
Created AGA-everything-2026-09-15.csv (18244 bytes) in Drive.
Link: https://drive.google.com/file/d/...
--- finished ---
```

Every run also appends to `drive-export.log`, so a job that fails at
18:00 on a Sunday is discoverable on Monday morning rather than
silently missing.

### 5. Schedule it nightly

Windows Task Scheduler -> **Create Basic Task**:

| Field | Value |
| --- | --- |
| Name | AGA Spreadsheet Export |
| Trigger | Daily, 18:00 |
| Action | Start a program |
| Program | `C:\Program Files\nodejs\node.exe` |
| Arguments | `C:\aga\drive-export.js` |
| Start in | `C:\aga` |

Then right-click the task -> **Run** once, to prove it works.

### 6. Make it a real Google Sheet (once)

The first upload is a `.csv`. Double-click it in Drive -> **Open with
Google Sheets** -> **File -> Save as Google Sheets**. From then on it is
a native sheet anyone in the office can open, and because the job
updates the file by name, the same file is refreshed every night.

---

## The cloud (Supabase)

The background job reads from Supabase, so the cloud needs to be
configured first. Everything the app needs is already written; what is
missing is the two values that connect this copy to *your* project.
`supabase-config.js` is still blank:

```js
const SUPABASE_URL = "";         /* empty */
const SUPABASE_ANON_KEY = "";    /* empty */
const SUPABASE_WORKSHOP_ID = ""; /* empty */
```

While those are blank, `isBackendConfigured()` returns `false` and the
app deliberately stays offline on `localStorage` - so the workshop is
never handed a half-configured tool.

Filling them in means logging into a Supabase account owned by
Architectural Glass & Aluminium. I have no credentials for it, and
creating a company account is a decision about who owns the workshop's
data. Follow `supabase/SETUP.md`; it is written as a step-by-step for
exactly this.

**What I verified** so the setup should work first time:

| Check | Result |
| --- | --- |
| Tables in `schema.sql` | `workshops`, `employees`, `projects`, `windows`, `status_history`, `activity` |
| Tables `sync.js` reads/writes | the same six - no mismatch |
| App accessors (`getProjects` / `getWindows` / `getEmployees` / `getActivity`) | all present |
| Offline queue + conflict handling | present; a pull refuses to overwrite while changes are queued |

---

## Why the key cannot live in the website

`supabase-config.js` is served to every visitor of the app. The anon
key is safe there because Row Level Security protects the data. A
Google service account key is **not** safe there - it is a master key
to the company's Drive. Anyone who viewed the page source could read
and delete every file the account can reach.

So it lives on the office PC, or in a Supabase Edge Function's secrets
if you would rather not depend on a machine being switched on. That
second option is a reasonable next step once the first upload is
proven working.

---

## Files

| File | Change |
| --- | --- |
| `export.js` | **new** - builds the spreadsheet; no UI, no DOM |
| `drive-export.js` | **new** - the background job: reads Supabase, uploads to Drive |
| `EXPORT-AND-DRIVE.md` | **new** - this document |

Nothing was added to the app interface, and nothing about saving,
syncing or quoting was altered. The app is unchanged to use; the
spreadsheet happens entirely behind it.
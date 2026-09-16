/*
  AGA -> Google Drive background uploader.

  Runs on its own, with no app and no button. It collects the workshop
  data, builds the spreadsheet, and puts it in a Google Drive folder.

  SET-UP (one time, see EXPORT-AND-DRIVE.md for the click-by-click)
  -----------------------------------------------------------------
  1. Google Cloud -> create a service account -> enable the Drive API
     -> download its JSON key.
  2. In Google Drive, create the folder and share it (Editor) with the
     service account's email address, which looks like
     aga-export@your-project.iam.gserviceaccount.com
  3. Put the key's path and the folder id in the environment:

       set AGA_DRIVE_KEY=C:\aga\drive-key.json
       set AGA_DRIVE_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz

  4. Run it:  node drive-export.js

  SCHEDULING
  ----------
  Windows Task Scheduler, nightly at 18:00:

    Program:   C:\Program Files\nodejs\node.exe
    Arguments: C:\aga\drive-export.js
    Start in:  C:\aga

  WHY A SERVICE ACCOUNT AND NOT THE WEBSITE
  -----------------------------------------
  The key that uploads to Drive is a master key to the company's
  Drive. It must never be served to a browser - supabase-config.js is
  readable by every visitor. Keeping it on the office machine, or in a
  Supabase Edge Function's secrets, is what makes this safe.
*/

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

/* ---------------------------------------------------------------------------
   CONFIGURATION
--------------------------------------------------------------------------- */

const DRIVE_KEY_PATH = process.env.AGA_DRIVE_KEY || "";
const DRIVE_FOLDER_ID = process.env.AGA_DRIVE_FOLDER_ID || "";

/*
   Where the workshop's data lives. Supabase is the source of truth once
   configured; set these to read straight from the cloud. If they are not
   set, the script reads the local export cache instead.
*/
const SUPABASE_URL = process.env.AGA_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.AGA_SUPABASE_ANON_KEY || "";

/* Writes an upload log next to this script, so a silent nightly job is
   never actually silent. */
const LOG_PATH = path.join(__dirname, "drive-export.log");

function log(message) {
    const line = new Date().toISOString() + "  " + message;

    console.log(line);

    try {
        fs.appendFileSync(LOG_PATH, line + "\n");
    } catch (error) {
        /* Logging must never be the thing that breaks the export. */
    }
}

/* ---------------------------------------------------------------------------
   GOOGLE SERVICE ACCOUNT AUTHENTICATION

   A service account signs its own JWT, exchanges it for an access token,
   and uses that token. No browser, no user, no consent screen.
--------------------------------------------------------------------------- */

function base64url(input) {
    return Buffer.from(input)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function httpsJson(options, body) {
    return new Promise((resolve, reject) => {
        const request = https.request(options, response => {
            let data = "";

            response.setEncoding("utf8");
            response.on("data", chunk => (data += chunk));

            response.on("end", () => {
                let parsed;

                try {
                    parsed = data ? JSON.parse(data) : {};
                } catch (error) {
                    return reject(
                        new Error("Reply was not JSON (" + response.statusCode + "): " + data.slice(0, 200))
                    );
                }

                if (response.statusCode >= 200 && response.statusCode < 300) {
                    return resolve(parsed);
                }

                reject(
                    new Error(
                        "HTTP " +
                        response.statusCode +
                        ": " +
                        (parsed.error_description || parsed.error?.message || JSON.stringify(parsed).slice(0, 300))
                    )
                );
            });
        });

        request.on("error", reject);
        request.setTimeout(30000, () => request.destroy(new Error("Request timed out")));

        if (body) {
            request.write(body);
        }

        request.end();
    });
}

async function getAccessToken(key) {
    const now = Math.floor(Date.now() / 1000);

    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));

    const claim = base64url(
        JSON.stringify({
            iss: key.client_email,
            scope: "https://www.googleapis.com/auth/drive.file",
            aud: "https://oauth2.googleapis.com/token",
            iat: now,
            exp: now + 3600,
        })
    );

    const signer = crypto.createSign("RSA-SHA256");
    signer.update(header + "." + claim);
    const signature = signer.sign(key.private_key);
    const jwt = header + "." + claim + "." + base64url(signature);

    const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
    }).toString();

    const result = await httpsJson(
        {
            hostname: "oauth2.googleapis.com",
            path: "/token",
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(body),
            },
        },
        body
    );

    return result.access_token;
}

/* ---------------------------------------------------------------------------
   GETTING THE WORKSHOP DATA
--------------------------------------------------------------------------- */

/*
   Pull the live data from Supabase, in the same shape the app keeps it
   locally. Read-only, so this can never damage workshop data.
*/
async function fetchFromSupabase() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        return null;
    }

    const call = table =>
        httpsJson({
            hostname: new URL(SUPABASE_URL).hostname,
            path: "/rest/v1/" + table + "?select=*",
            method: "GET",
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: "Bearer " + SUPABASE_ANON_KEY,
                Accept: "application/json",
            },
        });

    const [projects, windows, employees, activity] = await Promise.all([
        call("projects"),
        call("windows"),
        call("employees"),
        call("activity"),
    ]);

    return { projects, windows, employees, activity };
}

/*
   Turn Supabase's snake_case rows into the camelCase the app uses, so
   the same spreadsheet builder works for both sources.
*/
function snakeToCamelRow(row) {
    const out = {};

    Object.keys(row).forEach(key => {
        out[key.replace(/_([a-z])/g, (m, c) => c.toUpperCase())] = row[key];
    });

    return out;
}

function buildFromSupabase(data) {
    const windows = (data.windows || []).map(snakeToCamelRow);
    const projects = (data.projects || []).map(row => {
        const project = snakeToCamelRow(row);

        project.windows = windows.filter(window => window.projectId === project.id);

        return project;
    });

    return {
        projects,
        windows,
        employees: (data.employees || []).map(snakeToCamelRow),
        activity: (data.activity || []).map(snakeToCamelRow),
    };
}

/*
   Load export.js with the collected data, and get the CSV back.

   export.js reads through getProjects()/getWindows()/etc, so those are
   provided here instead of localStorage. This is why export.js keeps
   itself free of any DOM work.
*/
function buildCsv(dataset) {
    const source = fs.readFileSync(path.join(__dirname, "export.js"), "utf8");

    const sandbox = {
        dataset,
        quoteStamp(date) {
            const pad = value => String(value).padStart(2, "0");

            const day = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
            const time = [pad(date.getHours()), pad(date.getMinutes())].join(":");

            return day + String.fromCharCode(32) + time;
        },
        getProjects: () => dataset.projects || [],
        getWindows: () => dataset.windows || [],
        getEmployees: () => dataset.employees || [],
        getActivity: () => dataset.activity || [],
        window: {},
        console,
    };

    const vm = require("vm");
    const context = vm.createContext(sandbox);

    vm.runInContext(source, context);

    return {
        csv: context.window.AGA_EXPORT.workbookCsv(),
        filename: context.window.AGA_EXPORT.filename(),
        hasData: context.window.AGA_EXPORT.hasData(),
    };
}

/* ---------------------------------------------------------------------------
   UPLOADING TO DRIVE
--------------------------------------------------------------------------- */

/*
   Drive needs a multipart body: the metadata, then the file. Built by
   hand because the export has no dependencies and does not want any.
*/
function multipartBody(metadata, content) {
    const boundary = "aga" + crypto.randomBytes(12).toString("hex");

    const body = Buffer.concat([
        Buffer.from(
            "--" +
            boundary +
            "\r\n" +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            JSON.stringify(metadata) +
            "\r\n" +
            "--" +
            boundary +
            "\r\n" +
            "Content-Type: text/csv; charset=UTF-8\r\n\r\n",
            "utf8"
        ),
        Buffer.from(content, "utf8"),
        Buffer.from("\r\n--" + boundary + "--", "utf8"),
    ]);

    return { boundary, body };
}

/*
   Find a Drive file by name in the target folder. Used so a nightly run
   updates the same spreadsheet instead of filling the folder with one
   file per day.
*/
async function findExisting(token, folderId, name) {
    const query = encodeURIComponent(
        "'" + folderId + "' in parents and name = '" + name.replace(/'/g, "\\'") + "' and trashed = false"
    );

    const result = await httpsJson({
        hostname: "www.googleapis.com",
        path: "/drive/v3/files?q=" + query + "&fields=files(id,name)&pageSize=1",
        method: "GET",
        headers: { Authorization: "Bearer " + token },
    });

    return (result.files && result.files[0]) || null;
}

async function uploadToDrive(token, name, csv, existingId) {
    const metadata = existingId
        ? { name }
        : { name, mimeType: "text/csv", parents: [DRIVE_FOLDER_ID] };

    const { boundary, body } = multipartBody(metadata, csv);

    const filePath = existingId ? "/upload/drive/v3/files/" + existingId : "/upload/drive/v3/files";

    const method = existingId ? "PATCH" : "POST";

    return httpsJson(
        {
            hostname: "www.googleapis.com",
            path: filePath + "?uploadType=multipart&fields=id,name,webViewLink",
            method,
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "multipart/related; boundary=" + boundary,
                "Content-Length": Buffer.byteLength(body),
            },
        },
        body
    );
}

/* ---------------------------------------------------------------------------
   THE RUN
--------------------------------------------------------------------------- */

async function main() {
    log("--- AGA spreadsheet export started ---");

    if (!DRIVE_KEY_PATH || !DRIVE_FOLDER_ID) {
        log("STOPPED: AGA_DRIVE_KEY and AGA_DRIVE_FOLDER_ID must both be set.");
        log("See EXPORT-AND-DRIVE.md for the one-time set-up.");
        process.exitCode = 1;

        return;
    }

    if (!fs.existsSync(DRIVE_KEY_PATH)) {
        log("STOPPED: no service account key at " + DRIVE_KEY_PATH);
        process.exitCode = 1;

        return;
    }

    let dataset;

    try {
        const remote = await fetchFromSupabase();

        if (remote) {
            dataset = buildFromSupabase(remote);
            log(
                "Read from Supabase: " +
                dataset.projects.length +
                " projects, " +
                dataset.windows.length +
                " windows, " +
                dataset.activity.length +
                " work records."
            );
        } else {
            log("STOPPED: set AGA_SUPABASE_URL and AGA_SUPABASE_ANON_KEY to read the live data.");
            process.exitCode = 1;

            return;
        }
    } catch (error) {
        log("STOPPED: could not read the workshop data: " + error.message);
        process.exitCode = 1;

        return;
    }

    const built = buildCsv(dataset);

    if (!built.hasData) {
        log("Nothing to upload this run - the workshop has no data yet.");
        return;
    }

    let token;

    try {
        const key = JSON.parse(fs.readFileSync(DRIVE_KEY_PATH, "utf8"));

        token = await getAccessToken(key);
        log("Authenticated as " + key.client_email);
    } catch (error) {
        log("STOPPED: Google authentication failed: " + error.message);
        process.exitCode = 1;

        return;
    }

    try {
        const existing = await findExisting(token, DRIVE_FOLDER_ID, built.filename);
        const file = await uploadToDrive(token, built.filename, built.csv, existing && existing.id);

        log(
            (existing ? "Updated" : "Created") +
                String.fromCharCode(32) +
                file.name +
            " (" +
            built.csv.length +
            " bytes) in Drive."
        );

        if (file.webViewLink) {
            log("Link: " + file.webViewLink);
        }
    } catch (error) {
        log("STOPPED: Drive upload failed: " + error.message);
        process.exitCode = 1;

        return;
    }

    log("--- finished ---");
}

main().catch(error => {
    log("UNEXPECTED: " + error.stack);
    process.exitCode = 1;
});

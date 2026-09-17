/*
  AGA cloud configuration checker.

  Answers one question: is the cloud side of this app actually set up?

  It is deliberately NOT part of `npm run test`. The tests are offline and
  deterministic; this script talks to a live Supabase project, so it is run
  on demand:

      npm run check:cloud

  It checks the things that have silently gone wrong before:

    1. Are SUPABASE_URL and the publishable key present and well formed?
       (Structural, no network.)
    2. Is the project reachable at all?                     (auth health)
    3. Do the six tables from supabase/schema.sql exist?    (REST probe)
    4. Is there a workshop row to attach work to?
    5. Is Supabase Storage reachable, and does it have buckets?
    6. Are the AGA_DRIVE_* variables set for the nightly export?

  Exit code is 0 when the essential pieces are in place, 1 otherwise, so it
  can be wired into a deploy step later if wanted.

  The URL and key are read out of supabase-config.js. They are the public,
  safe-to-ship pair - the same values every visitor downloads - so printing
  the host is fine. The key itself is never echoed.
*/

'use strict';

const fs = require('fs');
const {
    EXPECTED_TABLES,
    readSupabaseConfig,
    isConfigured,
    validateSupabaseConfig,
    readDriveEnv,
    validateDriveEnv,
} = require('./cloud-config');

const TIMEOUT_MS = 15000;

function ok(message) {
    console.log('  [ok]   ' + message);
}

function warn(message) {
    console.log('  [warn] ' + message);
}

function fail(message) {
    console.log('  [FAIL] ' + message);
}

// Plain https GET, resolving { status, body } so a 404 is data, not a throw.
function get(url, headers) {
    const https = require('https');

    return new Promise((resolve, reject) => {
        const request = https.get(url, { headers: headers || {} }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => (body += chunk));
            response.on('end', () => resolve({ status: response.statusCode, body }));
        });

        request.on('error', reject);
        request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('timed out')));
    });
}

async function main() {
    let problems = 0;

    console.log('AGA cloud configuration');
    console.log('=======================');

    /* ---- 1 + 2. The config file, and the project it points at ---- */
    console.log('\nSupabase config (supabase-config.js)');

    const config = readSupabaseConfig();
    const structural = validateSupabaseConfig(config);

    for (const problem of structural) {
        fail(problem);
        problems += 1;
    }

    if (!isConfigured(config)) {
        fail('SUPABASE_URL and SUPABASE_ANON_KEY must both be set, or the app stays on localStorage only');
        console.log('\nStopped: nothing else can be checked without a project URL.');
        process.exitCode = 1;
        return;
    }

    if (structural.length === 0) {
        ok('SUPABASE_URL and the publishable key are present and well formed');
    }

    const keyIsSecret = String(config.anonKey).startsWith('sb_secret_');
    ok(keyIsSecret ? 'key is a SECRET (see FAIL above)' : 'key is publishable, safe to ship');

    if (String(config.workshopId || '').trim()) {
        ok('SUPABASE_WORKSHOP_ID is pinned');
    } else {
        warn('SUPABASE_WORKSHOP_ID is blank - the app will look up the single workshop row');
    }

    ok('ACCESS_MODE is "' + (config.accessMode || '(unset)') + '"');

    const base = String(config.url).replace(/\/+$/, '');
    const host = new URL(base).hostname;
    const headers = { apikey: config.anonKey, Authorization: 'Bearer ' + config.anonKey };

    console.log('\nProject reachability');
    console.log('  host: ' + host);

    try {
        const health = await get(base + '/auth/v1/health', { apikey: config.anonKey });

        if (health.status === 200) {
            ok('project is live and the key is accepted');
        } else {
            fail('auth health returned HTTP ' + health.status);
            problems += 1;
        }
    } catch (error) {
        fail('could not reach the project: ' + error.message);
        problems += 1;
        console.log('\nStopped: the project URL did not respond.');
        process.exitCode = 1;
        return;
    }

    /* ---- 3. Do the schema's tables exist? ---- */
    console.log('\nDatabase tables (from supabase/schema.sql)');

    const missing = [];

    for (const table of EXPECTED_TABLES) {
        const url = base + '/rest/v1/' + table + '?select=*&limit=1';

        try {
            const result = await get(url, headers);

            if (result.status === 200) {
                ok(table);
            } else if (result.status === 404) {
                fail(table + ' -> 404, the table does not exist');
                missing.push(table);
            } else {
                fail(table + ' -> HTTP ' + result.status);
                missing.push(table);
            }
        } catch (error) {
            fail(table + ' -> ' + error.message);
            missing.push(table);
        }
    }

    if (missing.length > 0) {
        problems += 1;
        console.log('');
        fail(missing.length + ' of ' + EXPECTED_TABLES.length + ' tables are missing.');
        console.log('       The schema has not been applied to this project.');
        console.log('       Fix: open the Supabase SQL editor and run supabase/schema.sql.');
        console.log('       Until then the app silently uses localStorage only - it will');
        console.log('       not error, it just will not sync.');
    }

    /* ---- 4. Is there a workshop to hang work off? ---- */
    if (!missing.includes('workshops')) {
        console.log('\nWorkshop row');

        try {
            const result = await get(base + '/rest/v1/workshops?select=id,name', headers);

            if (result.status !== 200) {
                fail('could not read workshops (HTTP ' + result.status + ')');
                problems += 1;
            } else {
                let rows = [];
                try {
                    rows = JSON.parse(result.body || '[]');
                } catch (_) {
                    fail('workshops reply was not JSON');
                    problems += 1;
                }

                if (rows.length === 0) {
                    warn('no workshop rows yet - run the schema, which generates one');
                } else if (rows.length === 1) {
                    ok('one workshop row: ' + (rows[0].name || '(unnamed)'));
                } else {
                    warn(rows.length + ' workshop rows; pin SUPABASE_WORKSHOP_ID to choose one');
                }
            }
        } catch (error) {
            fail('workshop check failed: ' + error.message);
            problems += 1;
        }
    }

    /* ---- 5. Storage. The app does not use buckets; say so plainly. ---- */
    console.log('\nSupabase Storage');

    try {
        const result = await get(base + '/storage/v1/bucket', headers);

        if (result.status !== 200) {
            warn('Storage API returned HTTP ' + result.status);
        } else {
            let buckets = [];
            try {
                buckets = JSON.parse(result.body || '[]');
            } catch (_) {
                buckets = [];
            }

            if (buckets.length === 0) {
                info_storage_note();
            } else {
                ok(buckets.length + ' bucket(s): ' + buckets.map(b => b.name || b.id).join(', '));
                warn('note: no code in this app reads or writes a bucket - photo rows are the real storage');
            }
        }
    } catch (error) {
        warn('Storage could not be checked: ' + error.message);
    }

    /* ---- 6. The Drive export environment. ---- */
    console.log('\nGoogle Drive export (drive-export.js)');

    const drive = readDriveEnv();
    const driveProblems = validateDriveEnv(drive);

    if (driveProblems.length === 0) {
        ok('AGA_DRIVE_KEY and AGA_DRIVE_FOLDER_ID are set');

        if (fs.existsSync(drive.keyPath)) {
            ok('the service-account key file exists');
        } else {
            fail('AGA_DRIVE_KEY points at a file that does not exist: ' + drive.keyPath);
            problems += 1;
        }
    } else {
        for (const problem of driveProblems) {
            warn(problem);
        }
        console.log('       This is expected on a dev machine - the nightly job runs');
        console.log('       on the office PC. See EXPORT-AND-DRIVE.md.');
    }

    /* ---- Verdict ---- */
    console.log('\n=======================');

    if (problems === 0) {
        console.log('Cloud configuration looks correct.');
    } else {
        console.log(problems + ' problem group(s) found - see [FAIL] lines above.');
        process.exitCode = 1;
    }
}

// Photos are data URLs on the windows row, so an empty bucket list is
// correct, not a gap. Spelled out because it is the easiest thing here to
// misread as "cloud storage is not set up".
function info_storage_note() {
    console.log('  [ok]   Storage is reachable and has no buckets');
    console.log('         This is expected: photos are base64 data URLs in the');
    console.log('         windows.photo column (see supabase/schema.sql), not objects.');
    console.log('         No code in this app uses a bucket.');
}

main().catch(error => {
    console.error('UNEXPECTED: ' + error.stack);
    process.exitCode = 1;
});

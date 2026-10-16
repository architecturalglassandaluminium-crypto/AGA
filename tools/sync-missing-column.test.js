// Unit tests for recovering from a column the database does not have yet.
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/sync-missing-column.test.js
//
// A column added to the app but not yet to the database rejects the whole
// write. Without recovery the sync queue retries, fails, and parks the
// save - so the workshop is told "could not save" over a cosmetic field.
// sync.js now retries once without the optional columns.
//
// The error shapes below are the REAL ones, captured from the live
// project. This matters: the first version of the matcher looked for
// SQLSTATE 42703, but PostgREST actually answers PGRST204 with a
// "schema cache" message, so the fallback would never have fired.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const syncSource = fs.readFileSync(path.join(ROOT, 'sync.js'), 'utf8');

/*
   Load the real matcher out of sync.js rather than restating it here,
   so the test cannot pass against a copy that has drifted.
*/
function loadMatcher() {
    const optional = syncSource.match(
        /const OPTIONAL_WINDOW_COLUMNS = \[([^\]]*)\];/
    );
    assert.ok(optional, 'OPTIONAL_WINDOW_COLUMNS was not found in sync.js');

    const columns = [...optional[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);

    const body = syncSource.match(
        /function isMissingColumnError\(error\)\s*\{([\s\S]*?)\n\}/
    );
    assert.ok(body, 'isMissingColumnError was not found in sync.js');

    // Evaluate the function in isolation with the column list in scope.
    // eslint-disable-next-line no-new-func
    return new Function(
        'OPTIONAL_WINDOW_COLUMNS',
        `return function isMissingColumnError(error) {${body[1]}}`
    )(columns);
}

const isMissingColumnError = loadMatcher();

// ---------------------------------------------------------------------------
// The real error, exactly as PostgREST returns it
// ---------------------------------------------------------------------------

test('recognises the real PostgREST missing-column error', () => {
    /*
       Captured from the live project:
         HTTP 400
         code: PGRST204
         message: Could not find the 'window_reference' column of
                  'windows' in the schema cache
    */
    const real = {
        code: 'PGRST204',
        message:
            "Could not find the 'window_reference' column of 'windows' in the schema cache",
    };

    assert.equal(
        isMissingColumnError(real),
        true,
        'the exact error the live database returns must be recognised'
    );
});

test('recognises the raw Postgres SQLSTATE too', () => {
    assert.equal(
        isMissingColumnError({ code: '42703', message: 'column does not exist' }),
        true,
        'a direct Postgres connection reports 42703 instead'
    );
});

test('recognises the wording alone, without a code', () => {
    assert.equal(
        isMissingColumnError({
            message: "Could not find the 'window_reference' column of 'windows' in the schema cache",
        }),
        true,
        'the message alone must be enough'
    );
});

// ---------------------------------------------------------------------------
// It must NOT swallow unrelated failures
// ---------------------------------------------------------------------------

test('does not treat an unrelated error as a missing column', () => {
    const unrelated = [
        { code: '23505', message: 'duplicate key value violates unique constraint' },
        { code: '42501', message: 'permission denied for table windows' },
        { code: 'PGRST301', message: 'JWT expired' },
        { message: 'network request failed' },
    ];

    unrelated.forEach(error => {
        assert.equal(
            isMissingColumnError(error),
            false,
            `must not swallow: ${error.code || ""} ${error.message}`
        );
    });
});

test('handles a missing or empty error safely', () => {
    assert.equal(isMissingColumnError(null), false);
    assert.equal(isMissingColumnError(undefined), false);
    assert.equal(isMissingColumnError({}), false);
});

// ---------------------------------------------------------------------------
// The recovery itself is wired in
// ---------------------------------------------------------------------------

test('uploadProject retries without the optional columns', () => {
    const body = syncSource.match(
        /async function uploadProject\(projectId\)\s*\{([\s\S]*?)\n\}/
    );

    assert.ok(body, 'uploadProject was not found in sync.js');

    assert.ok(
        /isMissingColumnError\(/.test(body[1]),
        'uploadProject must detect a missing column'
    );

    assert.ok(
        /OPTIONAL_WINDOW_COLUMNS\.forEach/.test(body[1]),
        'the retry must drop the optional columns'
    );

    assert.ok(
        /\.upsert\(trimmedRows/.test(body[1]),
        'the retry must send the trimmed rows'
    );
});

test('the reference column is listed as optional', () => {
    assert.ok(
        /OPTIONAL_WINDOW_COLUMNS = \["window_reference"\]/.test(syncSource),
        'window_reference must be the optional column'
    );
});
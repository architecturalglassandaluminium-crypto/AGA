// Unit tests for first-time PIN enrolment.
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/pin-enrolment.test.js
//
// signin.js is browser code, so these assert against SOURCE and the SQL:
// the contract spans the form, the sign-in logic and the database functions
// that actually guard the write. A mismatch between those is a security
// hole, not just a bug, which is why both sides are pinned here.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(relative) {
    return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

const signInSource = read('signin.js');
const appSource = read('app.js');
const syncSource = read('sync.js');
const htmlSource = read('index.html');
const sql = read('supabase/first-time-pin.sql');

function functionBody(source, name) {
    const match = source.match(
        new RegExp(`(?:async )?function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`)
    );
    assert.ok(match, `${name} was not found`);
    return match[1];
}

// ---------------------------------------------------------------------------
// The security-critical rule: no shared default PIN
// ---------------------------------------------------------------------------

test('new employees are created with NO pin, not a default', () => {
    // A shared default is not a secret: the staff list is publicly
    // readable, so 0000 would let anyone become any colleague.
    const body = functionBody(appSource, 'addEmployee');
    assert.doesNotMatch(body, /pin\s*[:=]\s*["']?\d{4}/, 'addEmployee must not set a PIN');
    assert.doesNotMatch(body, /pin_hash/, 'addEmployee must not write a pin_hash');
});

test('0000 is not used as a default anywhere in the app code', () => {
    for (const [name, source] of [
        ['signin.js', signInSource],
        ['app.js', appSource],
        ['sync.js', syncSource],
    ]) {
        assert.doesNotMatch(
            source,
            /pin\s*[:=]\s*["']0000["']/i,
            `${name} sets a default PIN of 0000`
        );
    }
});

test('the migration never seeds a default PIN', () => {
    assert.doesNotMatch(sql, /pin_hash\s*=\s*crypt\(\s*'0000'/i);
});

test('the migration explains why a shared default was rejected', () => {
    // The reasoning has to survive in the file, or someone will
    // "helpfully" add 0000 later.
    assert.match(sql, /WHY NOT A DEFAULT PIN/i);
});

// ---------------------------------------------------------------------------
// The SQL guard: enrolment may only FILL A GAP
// ---------------------------------------------------------------------------

test('claim_employee_pin refuses when a PIN already exists', () => {
    // Without this, anyone could re-enrol a colleague and take their
    // name - which is the whole thing the PIN protects against.
    const fn = sql.match(/create or replace function claim_employee_pin[\s\S]*?\$\$;/);
    assert.ok(fn, 'claim_employee_pin was not found in the migration');
    assert.match(
        fn[0],
        /and pin_hash is null/i,
        'claim_employee_pin must refuse to overwrite an existing PIN'
    );
});

test('claim_employee_pin refuses an inactive employee', () => {
    const fn = sql.match(/create or replace function claim_employee_pin[\s\S]*?\$\$;/);
    assert.match(fn[0], /and is_active/i);
});

test('claim_employee_pin validates the PIN in the DATABASE', () => {
    // The form is not the boundary.
    const fn = sql.match(/create or replace function claim_employee_pin[\s\S]*?\$\$;/);
    assert.match(fn[0], /\^\[0-9\]\{4,6\}\$/);
});

test('claim_employee_pin reports whether it actually wrote', () => {
    // The app must not treat "no error" as success, because a refused
    // update returns cleanly with zero rows affected.
    const fn = sql.match(/create or replace function claim_employee_pin[\s\S]*?\$\$;/);
    assert.match(fn[0], /get diagnostics affected = row_count/);
    assert.match(fn[0], /return affected > 0/);
});

test('the migration is idempotent', () => {
    assert.match(sql, /add column if not exists pin_set_at/i);
    assert.match(sql, /create or replace function/i);
});

test('existing PIN holders are backfilled so they are not re-enrolled', () => {
    // Anyone enrolled by hand before this must not be asked to set a
    // PIN they already have.
    assert.match(sql, /update employees[\s\S]*?set pin_set_at/i);
    assert.match(sql, /where pin_hash is not null/i);
});

test('employee_needs_pin returns only a boolean', () => {
    // It must not leak the hash or anything else to an anonymous caller.
    const fn = sql.match(/create or replace function employee_needs_pin[\s\S]*?\$\$;/);
    assert.ok(fn, 'employee_needs_pin was not found');
    assert.match(fn[0], /returns boolean/i);
    assert.doesNotMatch(fn[0], /returns table/i);
});

test('the functions are granted to anon, since phones are anonymous', () => {
    assert.match(sql, /grant execute on function employee_needs_pin\(uuid\)\s+to anon/i);
    assert.match(sql, /grant execute on function claim_employee_pin\(uuid, text\)\s+to anon/i);
});

test('the database is not granted UPDATE on employees directly', () => {
    // The only write to a PIN must go through the guarded function.
    assert.doesNotMatch(sql, /grant\s+update\s+on\s+employees\s+to\s+anon/i);
});

// ---------------------------------------------------------------------------
// The sign-in flow
// ---------------------------------------------------------------------------

test('the app asks whether a name needs a PIN', () => {
    assert.match(signInSource, /async function needsEnrolment\(employeeId\)/);
    assert.match(signInSource, /rpc\("employee_needs_pin"/);
});

test('an unanswered enrolment check falls back to normal sign-in', () => {
    // Assuming enrolment on a failure would let anyone overwrite a PIN.
    const body = functionBody(signInSource, 'needsEnrolment');
    assert.match(body, /return false/);
    assert.match(body, /catch/);
});

test('the form switches into enrolment mode', () => {
    assert.match(signInSource, /function setEnrolmentMode\(on\)/);
    assert.match(signInSource, /setEnrolmentMode\(enrolling\)/);
});

test('enrolment asks for the PIN twice', () => {
    // A PIN is hashed and cannot be read back, so a typo would lock
    // the person out of their own name.
    assert.match(htmlSource, /id="signInPinConfirmField"/);
    assert.match(htmlSource, /id="signInPinConfirm"/);
});

test('the confirmation must match before saving', () => {
    const body = functionBody(signInSource, 'enrolEmployee');
    assert.match(body, /confirmation !== pin/);
    assert.match(body, /do not match/);
});

test('enrolment saves through claim_employee_pin', () => {
    assert.match(signInSource, /rpc\("claim_employee_pin"/);
});

test('a refused claim is surfaced, not swallowed', () => {
    const body = functionBody(signInSource, 'enrolEmployee');
    assert.match(body, /data !== true/);
    assert.match(body, /already has a PIN/);
});

test('the PIN is validated in the app too, for a clear message', () => {
    const body = functionBody(signInSource, 'enrolEmployee');
    assert.match(body, /\^\[0-9\]\{4,6\}\$/);
});

test('after enrolling, the person continues straight in', () => {
    // Making them retype the PIN they just chose would be a pointless
    // extra step.
    const body = functionBody(signInSource, 'attemptSignIn');
    assert.match(body, /await completeSignIn\(employeeId, pin, button\)/);
});

test('both paths share one sign-in tail', () => {
    // So an enrolled person lands in the same state as a normal one.
    assert.match(signInSource, /async function completeSignIn\(employeeId, pin, button\)/);
    assert.match(signInSource, /rpc\("verify_employee_pin"/);
});

test('the button label reflects the action', () => {
    const body = functionBody(signInSource, 'setEnrolmentMode');
    assert.match(body, /Set PIN and continue/);
    assert.match(body, /Sign in/);
});

test('the confirm box is cleared when leaving enrolment mode', () => {
    const body = functionBody(signInSource, 'setEnrolmentMode');
    assert.match(body, /confirmInput\.value = ""/);
});

test('the flow does not tell an attacker whether a name exists', () => {
    // A wrong PIN reads the same either way.
    assert.match(signInSource, /not correct/);
});

// ---------------------------------------------------------------------------
// Adding an employee now reaches the cloud
// ---------------------------------------------------------------------------

test('adding an employee pushes to the cloud', () => {
    const body = functionBody(appSource, 'addEmployee');
    assert.match(body, /uploadEmployee/);
});

test('the same id is used locally and in the cloud', () => {
    // Two ids would create two rows for one person, and the sign-in
    // list would show them twice.
    const body = functionBody(appSource, 'addEmployee');
    assert.match(body, /const employeeId = uuid\(\)/);
    assert.match(body, /id: employeeId/);
    assert.match(body, /uploadEmployee\(employeeId\)/);
});

test('adding an employee still works with no connection', () => {
    // The local save must not be made conditional on the upload.
    const body = functionBody(appSource, 'addEmployee');
    const saveIndex = body.indexOf('saveEmployees(employees)');
    const uploadIndex = body.indexOf('uploadEmployee(employeeId)');
    assert.ok(saveIndex !== -1 && uploadIndex !== -1);
    assert.ok(saveIndex < uploadIndex, 'the local save must come first');
    assert.doesNotMatch(body, /await uploadEmployee/, 'the upload must not block the save');
});

test('the upload never carries a PIN', () => {
    // Check the ROW that is actually sent, not the whole function: the
    // body legitimately mentions "PIN" in a comment explaining that no
    // PIN is transmitted, and matching that would fail on the right code.
    const body = functionBody(syncSource, 'uploadEmployee');
    const row = body.match(/const row = \{([\s\S]*?)\};/);

    assert.ok(row, 'the upload row was not found');

    const keys = [...row[1].matchAll(/(\w+):/g)].map(m => m[1].toLowerCase());

    assert.ok(keys.includes('id'), 'the row should carry an id');
    assert.ok(keys.includes('workshop_id'), 'the row should carry a workshop_id');

    for (const key of keys) {
        assert.ok(
            !key.includes('pin'),
            `uploadEmployee sends a "${key}" field; a PIN must never leave the database`
        );
    }
});

test('the upload maps the local number to the employee_number column', () => {
    const body = functionBody(syncSource, 'uploadEmployee');
    assert.match(body, /employee_number: employee\.number/);
});

test('a duplicate name is reported in terms a person can act on', () => {
    const body = functionBody(syncSource, 'uploadEmployee');
    assert.match(body, /duplicate-name/);
    const addBody = functionBody(appSource, 'addEmployee');
    assert.match(addBody, /already exists in the shared team list/);
});

test('a failed push warns that the employee is device-only', () => {
    const body = functionBody(appSource, 'addEmployee');
    assert.match(body, /will not appear on other phones/);
});

test('the confirmation message tells the user about the PIN', () => {
    const body = functionBody(appSource, 'addEmployee');
    assert.match(body, /choose their own PIN/);
});

// ---------------------------------------------------------------------------
// Syntax guard
// ---------------------------------------------------------------------------

test('all three scripts parse as valid JavaScript', () => {
    const { execFileSync } = require('child_process');
    for (const file of ['app.js', 'signin.js', 'sync.js']) {
        assert.doesNotThrow(() => {
            execFileSync(process.execPath, ['--check', path.join(ROOT, file)], {
                stdio: 'pipe',
            });
        }, `${file} does not parse`);
    }
});

// Unit tests for the "confirm the next step" popup shown after a scan.
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/scan-status-popup.test.js
//
// The floor workflow is: choose your name, scan the window QR code, then
// confirm the step that was just completed. These tests pin that flow so a
// refactor cannot silently drop the confirmation and move a status on a
// bare scan again.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(relative) {
    return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

const appSource = read('app.js');
const htmlSource = read('index.html');

function functionBody(name) {
    const match = appSource.match(
        new RegExp(`function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`)
    );
    assert.ok(match, `${name} was not found in app.js`);
    return match[1];
}

// ---------------------------------------------------------------------------
// The popup exists and is wired up
// ---------------------------------------------------------------------------

test('the confirmation popup markup exists in index.html', () => {
    ['scanStatusModal', 'scanStatusSelect', 'scanStatusConfirmButton',
        'scanStatusCancelButton', 'scanStatusWindow', 'scanStatusWho'].forEach(id => {
            assert.ok(
                htmlSource.includes(`id="${id}"`),
                `index.html is missing #${id}`
            );
        });
});

test('the popup controls are hooked to their handlers', () => {
    const wiring = appSource.match(/scanStatusConfirmButton[\s\S]{0,400}/);
    assert.ok(wiring, 'scanStatusConfirmButton is not referenced in app.js');
    assert.ok(
        /confirmScanStatus/.test(wiring[0]),
        'the confirm button must call confirmScanStatus'
    );

    const cancel = appSource.match(/scanStatusCancelButton[\s\S]{0,400}/);
    assert.ok(cancel, 'scanStatusCancelButton is not referenced in app.js');
    assert.ok(
        /closeScanStatusModal/.test(cancel[0]),
        'the cancel button must close the popup without changing anything'
    );
});

// ---------------------------------------------------------------------------
// A scan opens the popup instead of moving the status directly
// ---------------------------------------------------------------------------

test('handleScannedQRCode opens the popup rather than changing status', () => {
    const body = functionBody('handleScannedQRCode');

    assert.ok(
        /openScanStatusPopup\(\s*item\s*\)/.test(body),
        'a successful scan must open the next-step popup'
    );

    // The scan must NOT call updateWindowStatus itself - the change has to
    // come from the confirmed popup only.
    assert.ok(
        !/updateWindowStatus\(/.test(body),
        'the scan handler must not move the status on its own'
    );
});

// ---------------------------------------------------------------------------
// The popup defaults to the step after the current one
// ---------------------------------------------------------------------------

test('the popup preselects the next status after the current one', () => {
    const body = functionBody('openScanStatusPopup');

    assert.ok(
        /STATUSES\[currentIndex \+ 1\]/.test(body),
        'the popup should default to the step following the current status'
    );

    assert.ok(
        /pendingScanStatus\s*=/.test(body),
        'the popup must remember the scanned window so Confirm cannot be misdirected'
    );
});

// ---------------------------------------------------------------------------
// Confirm goes through the guarded status update
// ---------------------------------------------------------------------------

test('confirmScanStatus routes through updateWindowStatus', () => {
    const body = functionBody('confirmScanStatus');

    assert.ok(
        /updateWindowStatus\(/.test(body),
        'Confirm must use updateWindowStatus so the scan proof and rules apply'
    );

    assert.ok(
        /pendingScanStatus/.test(body),
        'Confirm must verify a scan is actually pending'
    );
});

test('updateWindowStatus still refuses a status change without a scan', () => {
    const body = functionBody('updateWindowStatus');

    assert.ok(
        /scannedWindowId/.test(body),
        'updateWindowStatus must keep the scan-proof guard'
    );
});

// ---------------------------------------------------------------------------
// The confirmed step reaches the cloud
// ---------------------------------------------------------------------------

const syncSource = read('sync.js');

// functionBody() above reads app.js; uploadStatusChange lives in sync.js.
function syncFunctionBody(name) {
    const match = syncSource.match(
        new RegExp(`async function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`)
    );
    assert.ok(match, `${name} was not found in sync.js`);
    return match[1];
}

test('a confirmed step is queued for the cloud', () => {
    const body = functionBody('updateWindowStatus');

    /*
       The popup's only route to the cloud is updateWindowStatus()
       enqueueing a "status" change. If that disappears, a confirmed
       step saves on the phone and never syncs - silently, which is
       the failure mode these tests exist to catch.
    */
    assert.ok(
        /enqueue\(/.test(body),
        'updateWindowStatus must enqueue the change so it syncs'
    );

    assert.ok(
        /type:\s*"status"/.test(body),
        'the queued change must be a status change'
    );
});

test('the status queue is drained to Supabase', () => {
    assert.ok(
        /change\.type === "status"/.test(syncSource),
        'flushSyncQueue must handle status changes'
    );

    assert.ok(
        /uploadStatusChange\(/.test(syncSource),
        'a status change must be uploaded via uploadStatusChange'
    );
});

test('uploadStatusChange writes the window and its history', () => {
    const body = syncFunctionBody('uploadStatusChange');

    assert.ok(
        /\.from\("windows"\)/.test(body),
        'the status must be written to the windows table'
    );

    assert.ok(
        /status,/.test(body),
        'the status column must be part of the update'
    );

    assert.ok(
        /\.from\("status_history"\)/.test(body),
        'a status_history row must be recorded too'
    );
});

test('uploadStatusChange is defined in sync.js', () => {
    assert.ok(
        /async function uploadStatusChange\(/.test(syncSource),
        'uploadStatusChange must exist in sync.js'
    );
});

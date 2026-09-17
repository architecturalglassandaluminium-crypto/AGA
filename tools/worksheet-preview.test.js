// Unit tests for the read-only worksheet preview on the dashboard.
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/worksheet-preview.test.js
//
// READ-ONLY is the whole point of this feature, and it is the kind of
// property that erodes silently: someone adds an input, or wires the
// preview to a save path, and nothing looks wrong until a worksheet
// disagrees with the project form. These tests pin it.

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
const cssSource = read('styles.css');

function functionBody(name) {
    const match = appSource.match(
        new RegExp(`function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`)
    );
    assert.ok(match, `${name} was not found in app.js`);
    return match[1];
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

test('the dashboard header offers a View Worksheet button', () => {
    assert.match(htmlSource, /id="dashboardViewWorksheet"/);
    assert.match(htmlSource, /View Worksheet/);
});

test('the button is hidden until a project is selected', () => {
    // A worksheet button with no project selected is a dead control.
    const tag = htmlSource.match(/<button[^>]*id="dashboardViewWorksheet"[^>]*>/);
    assert.ok(tag, 'the button tag was not found');
    assert.match(tag[0], /\bhidden\b/);
});

test('the button follows the selection', () => {
    const body = functionBody('renderDashboardWindows');
    assert.match(body, /syncDashboardWorksheetButton\(\)/);
});

test('the button shows only when a project exists', () => {
    const body = functionBody('syncDashboardWorksheetButton');
    assert.match(body, /dashboardSelectedProjectId/);
    assert.match(body, /button\.hidden = !hasProject/);
});

// ---------------------------------------------------------------------------
// READ-ONLY: nothing may be typeable or saveable
// ---------------------------------------------------------------------------

test('the preview renders no form controls', () => {
    // A single <input> would make this an editor by accident.
    const body = functionBody('buildWorksheetPreviewHtml');

    for (const control of ['<input', '<select', '<textarea', 'contenteditable']) {
        assert.doesNotMatch(
            body,
            new RegExp(control, 'i'),
            `the preview contains "${control}", so it is not read-only`
        );
    }
});

test('the preview calls nothing that writes', () => {
    const body = functionBody('buildWorksheetPreviewHtml');

    for (const writer of [
        'saveProjects',
        'saveEmployees',
        'enqueue',
        'applyAllocation',
        'saveAllocation',
        'deleteProject',
        'addEmployee',
    ]) {
        assert.doesNotMatch(body, new RegExp(writer), `the preview calls ${writer}`);
    }
});

test('opening the preview writes nothing either', () => {
    const body = functionBody('viewProjectWorksheet');

    for (const writer of ['saveProjects', 'enqueue', 'applyAllocation', 'uploadProject']) {
        assert.doesNotMatch(body, new RegExp(writer), `viewProjectWorksheet calls ${writer}`);
    }
});

test('the preview reads the project rather than copying it', () => {
    // Reading the same record printProject reads is what stops the two
    // from showing different numbers.
    const body = functionBody('viewProjectWorksheet');
    assert.match(body, /getProjects\(\)\.find/);
    assert.match(body, /dashboardSelectedProjectId/);
});

test('the preview is marked read-only in the markup it renders', () => {
    // The banner and the data attribute are what tell a reader that
    // nothing here is editable.
    const body = functionBody('buildWorksheetPreviewHtml');
    assert.match(body, /data-readonly="true"/);
    assert.match(body, /Read-only preview/);
});

test('the banner points at where editing IS done', () => {
    const body = functionBody('buildWorksheetPreviewHtml');
    assert.match(body, /Projects tab/);
});

// ---------------------------------------------------------------------------
// What it shows
// ---------------------------------------------------------------------------

test('the preview carries the project facts', () => {
    const body = functionBody('buildWorksheetPreviewHtml');
    for (const field of ['customerName', 'siteAddress', 'projectNumber', 'projectName']) {
        assert.ok(body.includes(field), `the preview does not show ${field}`);
    }
});

test('the preview lists every per-item column', () => {
    const body = functionBody('buildWorksheetPreviewHtml');
    for (const field of [
        'windowNumber',
        'productType',
        'description',
        'location',
        'length',
        'width',
        'frameColour',
        'glassType',
        'status',
        'qcCheck',
        'allocatedTo',
    ]) {
        assert.ok(body.includes(field), `the preview does not show ${field}`);
    }
});

test('the preview does NOT claim a project size, type, frame or glass', () => {
    // The printed cover follows the same rule: those are per item.
    const body = functionBody('buildWorksheetPreviewHtml');
    assert.doesNotMatch(
        body,
        /row\(\s*"Size"/,
        'the preview states a project size, which a project does not have'
    );
    assert.doesNotMatch(body, /row\(\s*"Frame"/);
    assert.doesNotMatch(body, /row\(\s*"Glass"/);
});

test('the preview shows an item count, which IS a project fact', () => {
    const body = functionBody('buildWorksheetPreviewHtml');
    assert.match(body, /row\("Items"/);
});

test('the preview escapes every value it renders', () => {
    const body = functionBody('buildWorksheetPreviewHtml');
    assert.match(body, /escapeHtml\(label\)/);
    assert.match(body, /escapeHtml\(project\.projectNumber/);
    assert.match(body, /escapeHtml\(window\.description/);
});

test('an empty project says so rather than showing an empty table', () => {
    const body = functionBody('buildWorksheetPreviewHtml');
    assert.match(body, /No windows or doors captured/);
    assert.match(body, /windows\.length/);
});

test('the preview offers Print, which is a read operation', () => {
    // Printing is how a read-only view is actually used.
    const body = functionBody('buildWorksheetPreviewHtml');
    assert.match(body, /printProject\(/);
});

test('the preview does not embed QR or barcode marks', () => {
    // Those are for a scanner on paper and mean nothing on screen.
    const body = functionBody('buildWorksheetPreviewHtml');
    assert.doesNotMatch(body, /data-qr-print|data-barcode-print/);
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

test('a wide item table scrolls rather than stretching the modal', () => {
    assert.match(cssSource, /\.worksheet-preview-scroll\s*\{[^}]*overflow-x:\s*auto/);
});

test('the preview is styled as a document, not a form', () => {
    // No input styling should exist for it.
    assert.doesNotMatch(cssSource, /\.worksheet-preview[^{]*input/);
    assert.doesNotMatch(cssSource, /\.worksheet-preview[^{]*select/);
});

test('the read-only banner is visually distinct', () => {
    const rule = cssSource.match(/\.worksheet-preview-banner\s*\{([\s\S]*?)\}/);
    assert.ok(rule, 'the banner rule was not found');
    assert.match(rule[1], /border-left:/);
});

// ---------------------------------------------------------------------------
// Syntax guard
// ---------------------------------------------------------------------------

test('app.js still parses as valid JavaScript', () => {
    const { execFileSync } = require('child_process');
    assert.doesNotThrow(() => {
        execFileSync(process.execPath, ['--check', path.join(ROOT, 'app.js')], {
            stdio: 'pipe',
        });
    });
});

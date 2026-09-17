// Unit tests for the window barcode + row allocation wiring.
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/barcode.test.js
//
// app.js is browser code: it touches document, window and localStorage at
// load time, so it cannot be required here. These tests therefore assert
// against the SOURCE and the MARKUP - the contract between the three files
// that have to agree for a barcode to actually appear on paper:
//
//     index.html   loads the library, defines the column
//     app.js       builds the value and draws the symbol
//     styles.css   gives it printable size
//
// A silent mismatch between those three is exactly the class of bug that
// reaches the workshop floor, so each one is pinned here.

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

// ---------------------------------------------------------------------------
// The barcode library
// ---------------------------------------------------------------------------

test('index.html loads a barcode library', () => {
    assert.match(htmlSource, /JsBarcode/i, 'no barcode library is loaded');
});

test('the barcode library is loaded from https', () => {
    const tag = htmlSource.match(/<script[^>]+jsbarcode[^>]*>/i);
    assert.ok(tag, 'the JsBarcode script tag was not found');
    assert.match(tag[0], /https:\/\//, 'the library must load over https');
});

test('app.js guards against the barcode library failing to load', () => {
    // The QR still identifies the item, so a missing library must degrade
    // quietly rather than throwing and taking the worksheet down.
    assert.match(appSource, /typeof JsBarcode === "undefined"/);
});

// ---------------------------------------------------------------------------
// The value that gets encoded
// ---------------------------------------------------------------------------

test('a barcode value builder exists', () => {
    assert.match(appSource, /function buildWindowBarcodeValue\(/);
});

test('the barcode value is the window NUMBER, not the internal uuid', () => {
    // The number is what is printed in the ID column and written on the
    // paperwork, so a scan can be matched to the sheet by eye too.
    const body = appSource.match(
        /function buildWindowBarcodeValue\(windowNumber\)\s*\{([\s\S]*?)\}/
    );
    assert.ok(body, 'buildWindowBarcodeValue body was not found');
    assert.match(body[1], /windowNumber/, 'the value must come from the window number');
    assert.doesNotMatch(body[1], /\bid\b(?!Number)/, 'the internal id must not be encoded');
});

test('the barcode uses Code 128', () => {
    // Code 128 rather than Code 39: denser, so the full alphanumeric
    // window number fits a narrow schedule column.
    assert.match(appSource, /format:\s*"CODE128"/);
});

test('the barcode value is escaped when written into markup', () => {
    assert.match(appSource, /data-barcode-print="\$\{escapeHtml\(window\.windowNumber/);
});

// ---------------------------------------------------------------------------
// Where the barcode is rendered
// ---------------------------------------------------------------------------

test('the print schedule defines a barcode column', () => {
    assert.match(htmlSource, /class="c-barcode"/, 'the printed table has no barcode column');
});

test('the barcode column spans both rows of an item, like the QR', () => {
    assert.match(htmlSource, /c-barcode"[^>]*rowspan="2"/);
});

test('the multi-item worksheet emits a barcode place holder per row', () => {
    const count = (appSource.match(/data-barcode-print=/g) || []).length;
    assert.equal(count, 2, 'expected one per-item and one single-item worksheet');
});

test('a render helper exists and is called for the printed schedule', () => {
    assert.match(appSource, /function renderPrintBarcodes\(/);
    assert.match(appSource, /renderPrintBarcodes\(schedule\)/);
});

test('renderPrintBarcodes is called wherever the QR renderer is', () => {
    // The two must move together: a sheet with a QR and no barcode is a
    // sheet the laser scanner cannot read.
    const qrCalls = (appSource.match(/renderPrintQRCodes\(schedule\)/g) || []).length;
    const barCalls = (appSource.match(/renderPrintBarcodes\(schedule\)/g) || []).length;
    assert.equal(barCalls, qrCalls, 'barcode and QR renderers are out of step');
});

test('the render helper is exposed on window for the inline handlers', () => {
    assert.match(appSource, /window\.renderPrintBarcodes = renderPrintBarcodes/);
});

// ---------------------------------------------------------------------------
// Printing size
// ---------------------------------------------------------------------------

test('styles.css sizes the printed barcode', () => {
    assert.match(cssSource, /\.print-row-barcode/, 'the barcode has no print styling');
});

// The schedule's own rules live inside a @media print block, and the
// screen rules earlier in the file use the same selectors. Taking the last
// match gets the print one; taking the first silently tests the screen
// rule instead, which is what made an earlier version of these tests pass
// for the wrong reason.
function lastRuleFor(selectorPattern) {
    const matches = [...cssSource.matchAll(selectorPattern)];
    return matches.length ? matches[matches.length - 1][1] : null;
}

test('the printed barcode has a fixed width so the stripes stay proportional', () => {
    // A 1D barcode must not be stretched to fill its cell: the stripe
    // widths are the data, and distorting them breaks the checksum.
    const rule = lastRuleFor(/\.print-row-barcode svg\s*\{([\s\S]*?)\}/g);
    assert.ok(rule, '.print-row-barcode svg rule was not found');
    assert.match(rule, /width:\s*[\d.]+mm/, 'the barcode width must be set in mm');
    assert.match(rule, /height:\s*auto/, 'the height must follow the width, not stretch');
});

test('the printed QR size was reduced to make room for the barcode', () => {
    // Both marks share the item cell now, so an unchanged 24mm QR would
    // overflow the column.
    const rule = lastRuleFor(/\.print-row-qr,\s*\n\s*\.print-row-qr img,\s*\n\s*\.print-row-qr canvas\s*\{([\s\S]*?)\}/g);
    assert.ok(rule, 'the print QR rule was not found');
    const width = rule.match(/width:\s*([\d.]+)mm/);
    assert.ok(width, 'the QR width could not be read as mm');
    assert.ok(
        Number(width[1]) < 24,
        `the QR is still ${width[1]}mm; it must shrink to fit beside the barcode`
    );
});

// ---------------------------------------------------------------------------
// Allocating from a window row
// ---------------------------------------------------------------------------

test('a row allocation renderer exists', () => {
    assert.match(appSource, /function rowAllocationHtml\(/);
});

test('the project-list row uses the allocation picker', () => {
    assert.match(appSource, /<td class="col-allocated">\$\{rowAllocationHtml\(window\)\}/);
});

test('a row allocation save handler exists and is exposed', () => {
    assert.match(appSource, /function saveRowAllocation\(/);
    assert.match(appSource, /window\.saveRowAllocation = saveRowAllocation/);
});

test('the row picker asks for the employee by id, not by name', () => {
    assert.match(appSource, /data-row-allocated="\$\{escapeHtml\(window\.id\)\}"/);
});

test('the row picker stops the click from also opening the window record', () => {
    // The row itself opens the modal; without this, every pick would
    // open the record underneath the dropdown.
    assert.match(appSource, /onclick="event\.stopPropagation\(\)"/);
});

test('row selection does NOT reopen the window record', () => {
    // Allocating from a list is done repeatedly; reopening the modal each
    // time would interrupt the supervisor mid-sweep.
    assert.match(appSource, /reopen:\s*false/);
});

test('the modal path still reopens the record', () => {
    assert.match(appSource, /reopen:\s*true/);
});

test('both allocation paths share one writer', () => {
    // saveAllocation and saveRowAllocation must both delegate, so the
    // record, the queue entry and the toast cannot drift apart.
    const delegations = appSource.match(/return applyAllocation\(windowId, safeText\(select\.value\)/g) || [];
    assert.equal(delegations.length, 2, 'both paths should delegate to applyAllocation');
    assert.match(appSource, /function applyAllocation\(windowId, employeeId, options\)/);
});

test('the shared writer still queues a background sync', () => {
    assert.match(appSource, /type:\s*"allocate"/);
});

test('the row picker renders nothing selectable when there is no team yet', () => {
    // An empty dropdown is worse than the plain badge.
    const body = appSource.match(/function rowAllocationHtml\(window\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(body, 'rowAllocationHtml body was not found');
    assert.match(body[1], /if \(!employees\.length\)/);
    assert.match(body[1], /return allocatedBadgeHtml\(/);
});

// ---------------------------------------------------------------------------
// Syntax guard
// ---------------------------------------------------------------------------

test('app.js parses as valid JavaScript', () => {
    // A stray brace from an edit is the failure this catches, and it is
    // invisible until the page is opened.
    const { execFileSync } = require('child_process');
    assert.doesNotThrow(() => {
        execFileSync(process.execPath, ['--check', path.join(ROOT, 'app.js')], {
            stdio: 'pipe',
        });
    });
});

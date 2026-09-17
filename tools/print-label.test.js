// Unit tests for the printable item label and the window-lookup fix.
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/print-label.test.js
//
// The label spans three files that must agree for a sticker to reach paper:
// index.html defines the elements, app.js fills and prints them, styles.css
// sizes and gates them. A silent mismatch anywhere means the button does
// nothing on the floor, so each link is pinned here.
//
// Tests assert against SOURCE and MARKUP: app.js is browser code (it touches
// document and localStorage at load time) so it cannot be required.

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
// The lookup fix: project windows are nested inside projects
// ---------------------------------------------------------------------------

test('a shared window lookup exists', () => {
    assert.match(appSource, /function findWindowForPrint\(windowId\)/);
});

test('the shared lookup searches project windows first', () => {
    const body = functionBody('findWindowForPrint');
    assert.match(body, /getAllWindowsWithProject\(\)/);
});

test('the shared lookup keeps the legacy flat store as a fallback', () => {
    const body = functionBody('findWindowForPrint');
    assert.match(body, /getWindows\(\)/);
});

test('the shared lookup rejects an empty id', () => {
    const body = functionBody('findWindowForPrint');
    assert.match(body, /if \(!windowId\)/);
});

test('printWindow uses the shared lookup', () => {
    // It previously called getWindows() alone, which never contains a
    // window created through a project - so it always failed.
    const body = functionBody('printWindow');
    assert.match(body, /findWindowForPrint\(windowId\)/);
    assert.doesNotMatch(
        body,
        /const item =\s*\n?\s*getWindows\(\)\.find/,
        'printWindow must not look only in the legacy flat store'
    );
});

test('printLabel uses the shared lookup', () => {
    const body = functionBody('printLabel');
    assert.match(body, /findWindowForPrint\(windowId\)/);
});

// ---------------------------------------------------------------------------
// The label markup
// ---------------------------------------------------------------------------

test('index.html defines the printable label container', () => {
    assert.match(htmlSource, /id="printLabel"/);
});

test('the label container is print-only so it never shows on screen', () => {
    assert.match(htmlSource, /id="printLabel" class="print-only/);
});

test('the label carries a QR target, a barcode target and the window number', () => {
    assert.match(htmlSource, /id="printLabelQRCode"/);
    assert.match(htmlSource, /id="printLabelBarcode"/);
    assert.match(htmlSource, /id="printLabelNumber"/);
});

test('the label carries project, type and size fields', () => {
    assert.match(htmlSource, /id="printLabelProject"/);
    assert.match(htmlSource, /id="printLabelType"/);
    assert.match(htmlSource, /id="printLabelSize"/);
});

// ---------------------------------------------------------------------------
// Printing the label
// ---------------------------------------------------------------------------

test('printLabel is a function and is exposed for the inline button', () => {
    assert.match(appSource, /function printLabel\(windowId\)/);
    assert.match(appSource, /window\.printLabel = printLabel/);
});

test('the modal offers a Print Label button next to Print Worksheet', () => {
    assert.match(appSource, /onclick="printLabel\('\$\{item\.id\}'\)"/);
    assert.match(appSource, /Print Label/);
});

test('printLabel draws BOTH a QR and a barcode', () => {
    const body = functionBody('printLabel');
    assert.match(body, /generateQRCodeInElement\(/);
    assert.match(body, /generateBarcodeInElement\(/);
});

test('both marks encode the same window number', () => {
    const body = functionBody('printLabel');
    assert.match(body, /buildWindowIdQRContent\(windowNumber\)/);
    assert.match(body, /buildWindowBarcodeValue\(windowNumber\)/);
});

test('printLabel refuses a window with no number rather than printing a blank label', () => {
    const body = functionBody('printLabel');
    assert.match(body, /if \(!windowNumber\)/);
});

test('printLabel reports a missing window instead of throwing', () => {
    const body = functionBody('printLabel');
    assert.match(body, /showError/);
    assert.match(body, /return false/);
});

// ---------------------------------------------------------------------------
// Print isolation - the class that decides what comes out of the printer
// ---------------------------------------------------------------------------

test('label printing is gated on a body class', () => {
    assert.match(appSource, /print-label-active/);
});

test('the class is added by the shared print helper', () => {
    const body = functionBody('printWithLabelMode');
    assert.match(body, /classList\.add\("print-label-active"\)/);
});

test('the class is always cleared again', () => {
    const body = functionBody('printWithLabelMode');
    assert.match(body, /classList\.remove\("print-label-active"\)/);
});

test('the class is cleared on afterprint', () => {
    // The only reliable signal that the dialog has closed.
    const body = functionBody('printWithLabelMode');
    assert.match(body, /addEventListener\("afterprint"/);
});

test('the class is ALSO cleared on a timer, for browsers that never fire afterprint', () => {
    // A stuck class would make the NEXT worksheet print come out as a sticker.
    const body = functionBody('printWithLabelMode');
    assert.match(body, /setTimeout\(clear/);
});

test('printLabel clears the class if anything throws mid-print', () => {
    const body = functionBody('printLabel');
    assert.match(body, /classList\.remove\("print-label-active"\)/);
});

// ---------------------------------------------------------------------------
// The stylesheet
// ---------------------------------------------------------------------------

test('the label is hidden unless label mode is active', () => {
    assert.match(
        cssSource,
        /body:not\(\.print-label-active\) #printLabel\.print-only\s*\{[^}]*display:\s*none/
    );
});

test('label mode suppresses the worksheet, so the two never both print', () => {
    assert.match(cssSource, /body\.print-label-active #printWorksheet\.print-only/);
});

test('label mode suppresses the quote sheets too', () => {
    const rule = cssSource.match(
        /body\.print-label-active[^{]*\{([\s\S]*?)\}/
    );
    assert.ok(rule, 'the label-mode suppression rule was not found');
    assert.match(cssSource, /body\.print-label-active #quotePrintSheet\.print-only/);
});

test('the QR on the label is square, so it does not distort', () => {
    const rule = cssSource.match(
        /\.print-label-qr,\s*\n\s*\.print-label-qr img,\s*\n\s*\.print-label-qr canvas\s*\{([\s\S]*?)\}/
    );
    assert.ok(rule, 'the label QR size rule was not found');
    const width = rule[1].match(/width:\s*([\d.]+)mm/);
    const height = rule[1].match(/height:\s*([\d.]+)mm/);
    assert.ok(width && height, 'both width and height must be set in mm');
    assert.equal(width[1], height[1], 'a QR must be square or it will not scan');
});

test('the label QR is big enough to scan reliably', () => {
    const rule = cssSource.match(
        /\.print-label-qr,\s*\n\s*\.print-label-qr img,\s*\n\s*\.print-label-qr canvas\s*\{([\s\S]*?)\}/
    );
    const width = Number(rule[1].match(/width:\s*([\d.]+)mm/)[1]);
    assert.ok(width >= 20, `the label QR is ${width}mm, too small to scan comfortably`);
});

test('the label barcode is not stretched horizontally', () => {
    // Stretching changes the stripe widths, which ARE the data.
    const rule = cssSource.match(/\.print-label-barcode svg\s*\{([\s\S]*?)\}/);
    assert.ok(rule, 'the label barcode size rule was not found');
    assert.match(rule[1], /width:\s*[\d.]+mm/);
    assert.match(rule[1], /height:\s*auto/);
});

test('the label is sized to a sticker rather than a page', () => {
    const rule = cssSource.match(/\.print-label-sheet \.print-label\s*\{([\s\S]*?)\}/);
    assert.ok(rule, 'the label size rule was not found');
    assert.match(rule[1], /width:\s*9\dmm/);
});

test('a label never splits across two pages', () => {
    const rule = cssSource.match(/\.print-label-sheet \.print-label\s*\{([\s\S]*?)\}/);
    assert.match(rule[1], /break-inside:\s*avoid/);
});

// ---------------------------------------------------------------------------
// Syntax guard
// ---------------------------------------------------------------------------

test('app.js parses as valid JavaScript', () => {
    const { execFileSync } = require('child_process');
    assert.doesNotThrow(() => {
        execFileSync(process.execPath, ['--check', path.join(ROOT, 'app.js')], {
            stdio: 'pipe',
        });
    });
});

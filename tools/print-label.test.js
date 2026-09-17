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

test('the label sheet provides a stack that labels are built into', () => {
    // The sheet holds one label or many, so the markup is a container
    // filled by renderLabelSheet() rather than a fixed single label.
    assert.match(htmlSource, /id="printLabelStack"/);
});

test('the sheet no longer hard-codes a single label', () => {
    // Guards the refactor: a fixed single label cannot print a project.
    assert.doesNotMatch(htmlSource, /id="printLabelQRCode"/);
});

test('renderLabelSheet emits the number, project, type and size per label', () => {
    const body = functionBody('renderLabelSheet');
    assert.match(body, /class="print-label-number"/);
    assert.match(body, /class="print-label-project"/);
    assert.match(body, /item\.productType/);
    assert.match(body, /item\.length/);
});

test('renderLabelSheet emits a QR and a barcode target per label', () => {
    const body = functionBody('renderLabelSheet');
    assert.match(body, /data-label-qr-value/);
    assert.match(body, /data-label-barcode-value/);
});

test('renderLabelSheet escapes every value it writes', () => {
    const body = functionBody('renderLabelSheet');
    assert.match(body, /escapeHtml\(project\)/);
    assert.match(body, /escapeHtml\(windowNumber\)/);
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

test('the label sheet draws BOTH a QR and a barcode', () => {
    // Drawing moved into the shared renderer so one window and a whole
    // project take exactly the same path.
    const body = functionBody('renderLabelSheet');
    assert.match(body, /generateQRCodeInElement\(/);
    assert.match(body, /generateBarcodeInElement\(/);
});

test('both marks encode the same window number', () => {
    const body = functionBody('renderLabelSheet');
    assert.match(body, /buildWindowIdQRContent\(node\.dataset\.labelQrValue\)/);
    assert.match(body, /buildWindowBarcodeValue\(node\.dataset\.labelBarcodeValue\)/);
});

test('printLabel reuses the shared renderer rather than repeating it', () => {
    const body = functionBody('printLabel');
    assert.match(body, /renderLabelSheet\(\[item\]\)/);
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
// Printing every label on a project
// ---------------------------------------------------------------------------

test('printProjectLabels exists and is exposed for the inline button', () => {
    assert.match(appSource, /function printProjectLabels\(projectId\)/);
    assert.match(appSource, /window\.printProjectLabels = printProjectLabels/);
});

test('the project card offers Print All Barcodes beside Email', () => {
    // The two buttons must sit in the same action row.
    assert.match(appSource, /Print All Barcodes/);
    assert.match(appSource, /onclick="printProjectLabels\('\$\{project\.id\}'\)"/);
    const actions = appSource.match(/window-card-actions"[\s\S]*?<\/div>/);
    assert.ok(actions, 'the card action row was not found');
    assert.match(actions[0], /emailProject/, 'Email must still be in the row');
    assert.match(actions[0], /printProjectLabels/, 'Print All Barcodes must be in the row');
});

test('the button is only offered when the project has windows', () => {
    // A label button on an empty project is a dead control.
    const actions = appSource.match(/window-card-actions"[\s\S]*?<\/div>/);
    assert.match(actions[0], /\$\{windows\.length/);
});

test('printProjectLabels reports a missing project instead of throwing', () => {
    const body = functionBody('printProjectLabels');
    assert.match(body, /showError\("The project could not be found/);
});

test('printProjectLabels refuses a project with no windows', () => {
    const body = functionBody('printProjectLabels');
    assert.match(body, /no windows to label/);
});

test('printProjectLabels skips windows with no number', () => {
    // A window with no ID has nothing to encode, so it must not produce a
    // blank sticker.
    const body = functionBody('printProjectLabels');
    assert.match(body, /filter\(window => safeText\(window\.windowNumber\)\)/);
});

test('printProjectLabels refuses when NO window has a number', () => {
    const body = functionBody('printProjectLabels');
    assert.match(body, /nothing to label/);
});

test('printProjectLabels carries the project detail onto each label', () => {
    const body = functionBody('printProjectLabels');
    assert.match(body, /projectNumber: project\.projectNumber/);
    assert.match(body, /projectName: project\.projectName/);
});

test('printProjectLabels tells the user how many were skipped', () => {
    const body = functionBody('printProjectLabels');
    assert.match(body, /skipped/);
    assert.match(body, /showSuccess/);
});

test('the whole project is drawn in ONE print job, not one per window', () => {
    // Looping printLabel() would raise a print dialog per window.
    const body = functionBody('printProjectLabels');
    const prints = (body.match(/printWithLabelMode\(\)/g) || []).length;
    assert.equal(prints, 1, 'printProjectLabels must print once');
    assert.match(body, /renderLabelSheet\(labelled\)/);
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
    assert.match(rule[1], /width:\s*var\(--label-qr-size\)/);
    assert.match(rule[1], /height:\s*var\(--label-qr-size\)/);
});

test('the label QR is big enough to scan reliably', () => {
    const rule = cssSource.match(
        /\.print-label-qr,\s*\n\s*\.print-label-qr img,\s*\n\s*\.print-label-qr canvas\s*\{([\s\S]*?)\}/
    );
    assert.match(rule[1], /var\(--label-qr-size\)/);
    const floor = Number(appSource.match(/const MIN_LABEL_QR_MM = (\d+)/)[1]);
    assert.ok(floor >= 15, `the QR floor is ${floor}mm, too small for a phone camera`);
});

test('the label barcode is not stretched horizontally', () => {
    // Stretching changes the stripe widths, which ARE the data.
    const rule = cssSource.match(/\.print-label-barcode svg\s*\{([\s\S]*?)\}/);
    assert.ok(rule, 'the label barcode size rule was not found');
    assert.match(rule[1], /width:\s*var\(--label-barcode-width\)/);
    assert.match(rule[1], /height:\s*auto/);
});

test('the label stack lays labels out in a flowing grid', () => {
    // A sticker is not a page: six windows should use one or two A4
    // sheets, not six.
    const rule = cssSource.match(/#printLabelStack\s*\{([\s\S]*?)\}/);
    assert.ok(rule, 'the label stack rule was not found');
    assert.match(rule[1], /display:\s*flex/);
    assert.match(rule[1], /flex-wrap:\s*wrap/);
});

test('the label is sized to a sticker rather than a page', () => {
    const rule = cssSource.match(/\.print-label-sheet \.print-label\s*\{([\s\S]*?)\}/);
    assert.ok(rule, 'the label size rule was not found');
    assert.match(rule[1], /width:\s*var\(--label-width\)/);
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
// ---------------------------------------------------------------------------
// Label printer settings
//
// The geometry is chosen from a preset table rather than hardcoded, so the
// invariants live there now. These check the table and the wiring, not
// literal millimetre values that would change with every preset.
// ---------------------------------------------------------------------------

test('there is a preset table with a documented default', () => {
    assert.match(appSource, /const LABEL_SIZE_PRESETS = \{/);
    assert.match(appSource, /const DEFAULT_LABEL_PRESET = "90x55"/);
});

test('the default preset actually exists in the table', () => {
    const key = appSource.match(/const DEFAULT_LABEL_PRESET = "([^"]+)"/)[1];
    const block = appSource.match(/const LABEL_SIZE_PRESETS = \{([\s\S]*?)\n\};/)[1];
    assert.ok(block.includes(`"${key}"`), `the default "${key}" is not in the preset table`);
});

test('every preset carries the full geometry the stylesheet needs', () => {
    const block = appSource.match(/const LABEL_SIZE_PRESETS = \{([\s\S]*?)\n\};/)[1];
    for (const field of ['width', 'height', 'across', 'gap', 'padding', 'qr', 'barcode']) {
        assert.ok(block.includes(`${field}:`), `presets are missing "${field}"`);
    }
});

test('no preset shrinks the QR below the scannable floor', () => {
    // A QR the phone cannot resolve makes the sticker useless, so the
    // values are checked rather than trusted.
    const floor = Number(appSource.match(/const MIN_LABEL_QR_MM = (\d+)/)[1]);
    const block = appSource.match(/const LABEL_SIZE_PRESETS = \{([\s\S]*?)\n\};/)[1];
    const qrValues = [...block.matchAll(/qr:\s*([\d.]+)/g)].map(m => Number(m[1]));

    assert.ok(qrValues.length >= 4, 'expected several presets to check');
    for (const qr of qrValues) {
        assert.ok(qr >= floor, `a preset has a ${qr}mm QR, below the ${floor}mm floor`);
    }
});

test('the QR floor is enforced when applying, not only in the table', () => {
    const body = functionBody('applyLabelPreset');
    assert.match(body, /Math\.max\(preset\.qr, MIN_LABEL_QR_MM\)/);
});

test('every barcode fits inside its own label', () => {
    // A barcode wider than the sticker would be clipped on paper.
    const block = appSource.match(/const LABEL_SIZE_PRESETS = \{([\s\S]*?)\n\};/)[1];
    const entries = [...block.matchAll(/width:\s*([\d.]+)([\s\S]*?)barcode:\s*([\d.]+)/g)];

    assert.ok(entries.length >= 4, 'expected several presets to check');
    for (const entry of entries) {
        const labelWidth = Number(entry[1]);
        const barcodeWidth = Number(entry[3]);
        assert.ok(
            barcodeWidth <= labelWidth,
            `a ${barcodeWidth}mm barcode does not fit a ${labelWidth}mm label`
        );
    }
});

test('applying a preset writes every variable the stylesheet reads', () => {
    const body = functionBody('applyLabelPreset');
    for (const variable of [
        '--label-width',
        '--label-height',
        '--label-gap',
        '--label-padding',
        '--label-qr-size',
        '--label-barcode-width',
        '--label-across',
    ]) {
        assert.ok(body.includes(variable), `applyLabelPreset never sets ${variable}`);
    }
});

test('the preset is saved so it survives a reload', () => {
    const body = functionBody('setLabelPreset');
    assert.match(body, /localStorage\.setItem\(LABEL_PRESET_KEY/);
});

test('an unknown preset name is rejected rather than stored', () => {
    const body = functionBody('setLabelPreset');
    assert.match(body, /hasOwnProperty\.call\(LABEL_SIZE_PRESETS, name\)/);
    assert.match(body, /return false/);
});

test('a stale saved preset falls back to the default', () => {
    // A key from an older build could name a preset that no longer exists.
    const body = functionBody('getLabelPresetName');
    assert.match(body, /hasOwnProperty\.call\(LABEL_SIZE_PRESETS, stored\)/);
    assert.match(body, /return DEFAULT_LABEL_PRESET/);
});

test('reading the preset survives localStorage being unavailable', () => {
    // Private browsing can throw on access; the default is still correct.
    const body = functionBody('getLabelPresetName');
    assert.match(body, /catch/);
});

test('saving the preset survives localStorage being unavailable', () => {
    const body = functionBody('setLabelPreset');
    assert.match(body, /catch/);
});

test('the preset is applied when a label sheet is rendered', () => {
    // Otherwise the geometry would only take effect on the next print.
    const body = functionBody('renderLabelSheet');
    assert.match(body, /applyLabelPreset\(getLabelPresetName\(\)/);
});

test('a settings panel exists and is reachable', () => {
    assert.match(appSource, /function buildLabelSettingsHtml\(/);
    assert.match(appSource, /function openLabelSettings\(/);
    assert.match(appSource, /window\.openLabelSettings = openLabelSettings/);
});

test('the settings panel offers every preset', () => {
    const body = functionBody('buildLabelSettingsHtml');
    assert.match(body, /Object\.keys\(LABEL_SIZE_PRESETS\)/);
    assert.match(body, /onchange="setLabelPreset\(this\.value\)"/);
});

test('the settings panel warns about the print dialog settings', () => {
    // Margins:None and Scale:100% is the part people get wrong, and
    // without it the labels miss the sticker positions.
    const body = functionBody('buildLabelSettingsHtml');
    assert.match(body, /Margins/);
    assert.match(body, /100%/);
});

test('the project card offers Label Settings beside Print All Barcodes', () => {
    const actions = appSource.match(/window-card-actions"[\s\S]*?<\/div>/);
    assert.ok(actions, 'the card action row was not found');
    assert.match(actions[0], /printProjectLabels/);
    assert.match(actions[0], /openLabelSettings/);
});

test('the settings panel escapes what it prints', () => {
    const body = functionBody('buildLabelSettingsHtml');
    assert.match(body, /escapeHtml/);
});

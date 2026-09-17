// Unit tests for what the two worksheets show.
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/worksheet.test.js
//
// The project cover and the single-item sheet share ONE detail grid in
// index.html, so the only thing keeping them different is a class on the
// sheet plus which function ran. That is exactly the kind of implicit
// contract that breaks silently, so both halves are pinned here.

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
// The item-level rows are marked in the markup
// ---------------------------------------------------------------------------

test('the item-level rows are marked as item-only', () => {
    // Without the marker there is nothing for the stylesheet to hide.
    const marked = (htmlSource.match(/print-item-only/g) || []).length;
    assert.ok(marked >= 6, `expected the size/type/location/frame/glass/allocated rows, found ${marked}`);
});

test('every field that only makes sense per window is marked', () => {
    for (const id of [
        'printWidth',
        'printHeight',
        'printWindowType',
        'printLocation',
        'printFrameColour',
        'printGlassType',
        'printAllocatedTo',
    ]) {
        // Find the row containing this id and confirm it is marked.
        const index = htmlSource.indexOf(`id="${id}"`);
        assert.ok(index !== -1, `${id} was not found in the markup`);

        const rowStart = htmlSource.lastIndexOf('<tr', index);
        const row = htmlSource.slice(rowStart, index);

        assert.ok(
            row.includes('print-item-only'),
            `the row holding ${id} is not marked print-item-only`
        );
    }
});

// ---------------------------------------------------------------------------
// The stylesheet hides them on a project cover
// ---------------------------------------------------------------------------

test('a project cover hides the item-level rows', () => {
    const rule = cssSource.match(/\.print-project \.print-item-only\s*\{([\s\S]*?)\}/);
    assert.ok(rule, 'the .print-project .print-item-only rule was not found');
    assert.match(rule[1], /display:\s*none/);
});

test('the hiding is scoped to the project cover, not global', () => {
    // A bare `.print-item-only { display:none }` would blank these rows
    // on the single-item sheet too, where they are the whole point.
    assert.doesNotMatch(
        cssSource,
        /(^|\n)\s*\.print-item-only\s*\{/,
        'the item-only rows must not be hidden unconditionally'
    );
});

// ---------------------------------------------------------------------------
// Each print path sets the class explicitly
// ---------------------------------------------------------------------------

test('printProject marks the sheet as a project cover', () => {
    const body = functionBody('printProject');
    assert.match(body, /classList\.add\("print-project"\)/);
});

test('printWindow clears the project mark', () => {
    // Otherwise printing a project and then a single window would leave
    // the class set, and the item rows would stay hidden.
    const body = functionBody('printWindow');
    assert.match(body, /classList\.remove\("print-project"\)/);
});

test('both print paths set the class, so neither inherits the other', () => {
    assert.match(functionBody('printProject'), /print-project/);
    assert.match(functionBody('printWindow'), /print-project/);
});

// ---------------------------------------------------------------------------
// The project cover no longer claims a size
// ---------------------------------------------------------------------------

test('the project cover does not print a size RANGE as a project fact', () => {
    // It used to write "L 1200-2100 mm | W 900-900 mm" under a heading
    // reading "Size (mm)", which reads as the project having one size.
    const body = functionBody('printProject');
    const writesSizeRange =
        /setPrintText\(\s*"printWidth"/.test(body) ||
        /setPrintText\(\s*"printHeight"/.test(body);

    assert.equal(
        writesSizeRange,
        false,
        'printProject still writes a size into the project header'
    );
});

test('the single-item sheet still prints its own size', () => {
    const body = functionBody('printWindow');
    assert.match(body, /setPrintText\(\s*"printWidth"/);
    assert.match(body, /setPrintText\(\s*"printHeight"/);
});

test('the schedule below still carries per-item sizes', () => {
    // Removing the header range must not remove the per-window data;
    // the schedule is now the ONLY place sizes appear on a project
    // sheet, so it has to be there.
    const body = functionBody('printProject');
    assert.match(body, /windowRowTableHtml|printSchedule/);
    assert.match(body, /c-size/);
});

test('the shared detail grid carries the item-only markers', () => {
    // Guards the refactor rather than the behaviour: the detail grid is
    // shared markup, so a new per-item field must carry the marker.
    const html = htmlSource.match(/id="printWorksheet"[\s\S]*?<\/div>\s*\n\s*<!--\s*PRINTABLE ITEM LABEL/);
    assert.ok(html, 'the worksheet block was not found');
    assert.ok(html[0].includes('print-item-only'), 'the worksheet has no item-only markers');
});
// ---------------------------------------------------------------------------
// The masthead: no solid fill.
//
// A header band is the largest solid ink area on the sheet, so it is the
// first thing to band on a laser printer and the first thing to look wrong
// on a low cartridge. The hierarchy is carried by weight and a rule instead.
// ---------------------------------------------------------------------------

function cssRule(selectorPattern) {
    const match = cssSource.match(selectorPattern);
    assert.ok(match, `rule not found: ${selectorPattern}`);
    return match[1];
}

test('the worksheet header has no dark fill', () => {
    const rule = cssRule(/\.print-masthead\s*\{([\s\S]*?)\n    \}/);

    assert.match(rule, /background:\s*transparent/, 'the header still has a fill');
    assert.doesNotMatch(
        rule,
        /background:\s*#1a1a1a/i,
        'the near-black masthead band is still there'
    );
});

test('the header text is black, not white', () => {
    // White text was only legible because of the band. With the band gone
    // it would print white-on-white.
    const rule = cssRule(/\.print-masthead\s*\{([\s\S]*?)\n    \}/);
    assert.match(rule, /color:\s*#000\b/);
    assert.doesNotMatch(rule, /color:\s*#fff\b/);
});

test('the header keeps a rule so it still reads as a boundary', () => {
    // Removing a band without adding anything leaves the header floating.
    const rule = cssRule(/\.print-masthead\s*\{([\s\S]*?)\n    \}/);
    assert.match(rule, /border-bottom:/);
});

test('the masthead title is black', () => {
    const rule = cssRule(/\.print-masthead-title\s*\{([\s\S]*?)\}/);
    assert.match(rule, /color:\s*#000\b/);
});

test('the masthead subtitle is grey, not near-white', () => {
    // It was #d4d4d4 for the dark band; that is invisible on paper.
    const rule = cssRule(/\.print-masthead-sub\s*\{([\s\S]*?)\}/);
    assert.doesNotMatch(rule, /color:\s*#d4d4d4/i);
    assert.match(rule, /color:\s*#444\b/);
});

test('the item ID box is outlined, not filled', () => {
    const rule = cssRule(/\.print-masthead-id\s*\{([\s\S]*?)\n    \}/);
    assert.match(rule, /background:\s*transparent/);
    assert.match(rule, /border:/);
});

test('the status chip is outlined rather than filled', () => {
    const rule = cssRule(/\.print-status-chip\s*\{([\s\S]*?)\}/);
    assert.match(rule, /border:/);
    assert.doesNotMatch(rule, /background:\s*#1a1a1a/i);
});

test('no print rule fills a block with near-black', () => {
    // A blunt sweep, so a NEW dark fill anywhere in the print stylesheet
    // fails here rather than being discovered on paper.
    const printBlocks = cssSource.match(/@media print[\s\S]*/);
    assert.ok(printBlocks, 'no @media print block found');

    const darkFills = [...printBlocks[0].matchAll(/background:\s*(#(?:1[0-9a-f]{5}|[0-9a-f]{3,5})|black)\b/gi)]
        .map(m => m[0])
        .filter(text => !/#fff|#ffffff|white/i.test(text));

    assert.deepEqual(
        darkFills,
        [],
        `a solid dark fill was found in the print styles: ${darkFills.join(', ')}`
    );
});

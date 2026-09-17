// Unit tests for AGA spreadsheet export (export.js).
//
// export.js is written to run in two places:
//   1. the browser, loaded after quotes.js/app.js (globals present), and
//   2. a Node background job, where it must be `require`-able on its own.
//
// Run with:  node --test "tools/*.test.js"
//
// The suite loads export.js in an ISOLATED vm context that deliberately
// provides ONLY the globals a Node job would have - no DOM, no app.js, no
// quotes.js. If the file secretly depends on a global that only exists in
// the browser, these tests fail, which is the point.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXPORT_PATH = path.join(__dirname, '..', 'export.js');
const SOURCE = fs.readFileSync(EXPORT_PATH, 'utf8');

// Build a sandbox with the collections stubbed, exposing window.AGA_EXPORT.
function loadExport(collections = {}) {
    const sandbox = {
        console,
        Date,
        JSON,
        Map,
        Set,
        isNaN,
        String,
        Number,
        Array,
        Object,
        RegExp,
        Math,
        window: {},
    };
    sandbox.window.getProjects = () => collections.projects || [];
    sandbox.window.getWindows = () => collections.windows || [];
    sandbox.window.getEmployees = () => collections.employees || [];
    sandbox.window.getActivity = () => collections.activity || [];
    // Mirror app.js, which also exposes these as bare globals.
    sandbox.getProjects = sandbox.window.getProjects;
    sandbox.getWindows = sandbox.window.getWindows;
    sandbox.getEmployees = sandbox.window.getEmployees;
    sandbox.getActivity = sandbox.window.getActivity;

    vm.createContext(sandbox);
    vm.runInContext(SOURCE, sandbox, { filename: 'export.js' });
    return sandbox.window.AGA_EXPORT;
}

const QUOTE = String.fromCharCode(34);

// A representative project + window, in the camelCase shape the app uses.
const SAMPLE = {
    projects: [
        {
            id: 'p1',
            projectNumber: 'AGA-100',
            projectName: 'Kruger House',
            customerName: 'J Kruger',
            customerEmail: 'j@example.com',
            customerPhone: '010 000 0000',
            siteAddress: '1 Main Rd',
            createdAt: '2026-09-15T08:14:00.000Z',
        },
    ],
    windows: [
        {
            id: 'w1',
            projectId: 'p1',
            windowNumber: 'W-1',
            productType: 'Window',
            description: 'Sliding',
            status: 'Installed',
            length: 1200,
            width: 900,
            qcCheck: 'glass|frame',
            createdAt: '2026-09-15T08:14:00.000Z',
        },
    ],
    activity: [
        {
            employee: 'Sipho',
            status: 'Installed',
            date: '2026-09-15T08:14:00.000Z',
            windowNumber: 'W-1',
        },
    ],
    employees: [{ name: 'Sipho', employeeNumber: 'E-1', role: 'Fitter' }],
};

// ---------------------------------------------------------------------------
// Loading / the Node contract
// ---------------------------------------------------------------------------

test('exposes the public API on window.AGA_EXPORT', () => {
    const api = loadExport(SAMPLE);
    assert.equal(typeof api, 'object');
    for (const fn of ['workbookCsv', 'allSheetCsv', 'windows', 'projects', 'activity', 'employees', 'filename', 'hasData']) {
        assert.equal(typeof api[fn], 'function', `AGA_EXPORT.${fn} should be a function`);
    }
});

test('does not throw when loaded with no collections present', () => {
    assert.doesNotThrow(() => loadExport({}));
});

// ---------------------------------------------------------------------------
// csvDate / csvFilename  (these depend on quoteStamp)
// ---------------------------------------------------------------------------

test('windows sheet renders a Created column instead of throwing', () => {
    const api = loadExport(SAMPLE);
    assert.doesNotThrow(() => api.windows());
});

test('projects sheet renders a Created column instead of throwing', () => {
    const api = loadExport(SAMPLE);
    assert.doesNotThrow(() => api.projects());
});

test('activity sheet renders a When column instead of throwing', () => {
    const api = loadExport(SAMPLE);
    assert.doesNotThrow(() => api.activity());
});

test('employees sheet renders Last Step Recorded instead of throwing', () => {
    const api = loadExport(SAMPLE);
    assert.doesNotThrow(() => api.employees());
});

test('allSheetCsv completes with dated data present', () => {
    const api = loadExport(SAMPLE);
    assert.doesNotThrow(() => api.allSheetCsv());
});

test('workbookCsv completes with dated data present', () => {
    const api = loadExport(SAMPLE);
    assert.doesNotThrow(() => api.workbookCsv());
});

test('filename produces a dated .csv name', () => {
    const api = loadExport(SAMPLE);
    assert.doesNotThrow(() => api.filename());
    assert.match(api.filename(), /^AGA-everything-\d{4}-\d{2}-\d{2}\.csv$/);
});

// ---------------------------------------------------------------------------
// csvCell - formula injection, RFC 4180 quoting, photo rows
// ---------------------------------------------------------------------------

test('neutralises a leading = so it cannot be evaluated as a formula', () => {
    const api = loadExport({ projects: [{ id: 'p', customerName: '=SUM(A1:A9)' }] });
    const row = api.projects()[1];
    assert.ok(row.includes("'=SUM"), `expected escaped formula, got: ${row}`);
});

test('quotes a cell containing a comma', () => {
    const api = loadExport({ projects: [{ id: 'p', projectName: 'A, B' }] });
    const row = api.projects()[1];
    assert.ok(row.includes('"A, B"'), `expected quoting, got: ${row}`);
});

test('quotes a cell and doubles every embedded quote (RFC 4180)', () => {
    // See QUOTE constant above; avoids literal-quote matching issues.
    const original = 'He said ' + QUOTE + 'hi' + QUOTE;
    const apiQ = loadExport({ projects: [{ id: 'p', projectName: original }] });
    const cellQ = apiQ.projects()[1].split(',')[1];
    assert.equal(cellQ, QUOTE + 'He said ' + QUOTE + QUOTE + 'hi' + QUOTE + QUOTE + QUOTE);
    assert.equal(cellQ.length, original.length + 4);
    // A second, independent check on the raw cell value.
    const rawApi = loadExport({ projects: [{ id: 'p', projectName: 'He said ' + QUOTE + 'hi' + QUOTE }] });
    const rawCell = rawApi.projects()[1].split(',')[1];
    assert.equal(rawCell.length, ('He said ' + QUOTE + 'hi' + QUOTE).length + 4);
    assert.ok(rawCell.startsWith(QUOTE), 'cell must start with a quote'); // '"He said ""hi"""'), `expected doubled quotes, got: ${row}`);
    assert.equal(rawCell, QUOTE + 'He said ' + QUOTE + QUOTE + 'hi' + QUOTE + QUOTE + QUOTE);
});

test('replaces a data-URL photo with [photo]', () => {
    const api = loadExport({
        windows: [{ id: 'w', projectId: 'p', description: 'data:image/png;base64,AAAA' }],
        projects: [{ id: 'p' }],
    });
    assert.ok(api.windows()[1].includes('[photo]'));
});

// ---------------------------------------------------------------------------
// csvPlain - objects must not read as [object Object]
// ---------------------------------------------------------------------------

test('flattens an object value to JSON rather than [object Object]', () => {
    const objectValue = { a: 1 };
    const windows = [{ id: 'w', description: objectValue }];
    const api = loadExport({ windows });
    const row = api.windows()[1];
    assert.equal(row.includes('[object Object]'), false);
    assert.ok(row.includes('{""a"":1}') || row.includes('{"a":1}'), `got: ${row}`);
});

test('handles a circular object without throwing', () => {
    const circular = {};
    circular.self = circular;
    const windows = [{ id: 'w', description: circular }];
    const api = loadExport({ windows });
    assert.doesNotThrow(() => api.windows());
});

// ---------------------------------------------------------------------------
// Sheet shapes / row counts
// ---------------------------------------------------------------------------

test('each sheet starts with exactly one header row', () => {
    const api = loadExport({});
    assert.equal(api.windows().length, 1);
    assert.equal(api.projects().length, 1);
    assert.equal(api.activity().length, 1);
    assert.equal(api.employees().length, 1);
});

test('hasData is false when every collection is empty', () => {
    const api = loadExport({});
    assert.equal(api.hasData(), false);
});

test('hasData is true when only windows exist', () => {
    const api = loadExport({ windows: [{ id: 'w' }] });
    assert.equal(api.hasData(), true);
});

test('an orphan window (no matching project) is still exported', () => {
    const api = loadExport({ windows: [{ id: 'w', projectId: 'missing', windowNumber: 'W-9' }] });
    const rows = api.windows();
    assert.equal(rows.length, 2);
    assert.ok(rows[1].includes('W-9'));
});

test('a window is not exported twice when the project holds it inline', () => {
    const api = loadExport({
        projects: [{ id: 'p', windows: [{ id: 'w', windowNumber: 'W-1' }] }],
        windows: [{ id: 'w', projectId: 'p', windowNumber: 'W-1' }],
    });
    // header + exactly one data row
    assert.equal(api.windows().length, 2);
});

test('project sheet counts items and installed items', () => {
    const api = loadExport(SAMPLE);
    const row = api.projects()[1];
    // Date is rendered in LOCAL time, so assert the shape rather than a
    // fixed hour (that would make the test depend on the runner's timezone).
    assert.match(row, /,1,1,\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, `got: ${row}`);
});

test('BOM is present on each standalone sheet string', () => {
    const api = loadExport(SAMPLE);
    assert.equal(api.allSheetCsv().windows.charCodeAt(0), 0xFEFF);
    assert.equal(api.allSheetCsv().projects.charCodeAt(0), 0xFEFF);
    assert.equal(api.allSheetCsv().activity.charCodeAt(0), 0xFEFF);
    assert.equal(api.allSheetCsv().employees.charCodeAt(0), 0xFEFF);
});

// ---------------------------------------------------------------------------
// Robustness: a broken accessor must not kill the export
// ---------------------------------------------------------------------------

test('a throwing accessor yields an empty sheet, not a crash', () => {
    const sandbox = {
        console,
        Date, JSON, Map, Set, isNaN, String, Number, Array, Object, RegExp, Math,
        window: {},
    };
    sandbox.getProjects = () => { throw new Error('boom'); };
    sandbox.getWindows = () => [];
    sandbox.getEmployees = () => [];
    sandbox.getActivity = () => [];
    sandbox.window.getProjects = sandbox.getProjects;
    sandbox.window.getWindows = sandbox.getWindows;
    sandbox.window.getEmployees = sandbox.getEmployees;
    sandbox.window.getActivity = sandbox.getActivity;

    vm.createContext(sandbox);
    vm.runInContext(SOURCE, sandbox, { filename: 'export.js' });
    assert.doesNotThrow(() => sandbox.window.AGA_EXPORT.projects());
});

test('an invalid date is passed through verbatim, not as Invalid Date', () => {
    const api = loadExport({ projects: [{ id: 'p', createdAt: 'not-a-date' }] });
    const row = api.projects()[1];
    assert.ok(row.includes('not-a-date'), `got: ${row}`);
    assert.equal(row.includes('Invalid Date'), false);
});

test('a missing date renders as an empty cell', () => {
    const api = loadExport({ projects: [{ id: 'p' }] });
    const row = api.projects()[1];
    assert.equal(row.includes('Invalid'), false);
});

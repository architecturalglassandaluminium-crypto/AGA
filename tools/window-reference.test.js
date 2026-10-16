// Unit tests for the Window Reference field.
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/window-reference.test.js
//
// The reference is the workshop's own name for a window ("Kitchen
// slider"), typed in by hand and unique within a project. It is separate
// from window_number, which the app mints itself. These tests pin the
// places a new field has to be carried through, because a field that is
// collected but never saved - or saved but never synced - fails silently.

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
const syncSource = read('sync.js');
const schemaSource = read('supabase/schema.sql');

function functionBody(name) {
    const match = appSource.match(
        new RegExp(`function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`)
    );
    assert.ok(match, `${name} was not found in app.js`);
    return match[1];
}

// ---------------------------------------------------------------------------
// The field is on the form
// ---------------------------------------------------------------------------

test('the project window table has a Window Reference column', () => {
    assert.ok(
        /<th>Window Reference<\/th>/.test(htmlSource),
        'index.html must carry a "Window Reference" column header'
    );
});

test('each window row has a reference input', () => {
    const body = functionBody('addProjectWindowRow');

    assert.ok(
        /data-field="windowReference"/.test(body),
        'the window row must render a reference input'
    );

    assert.ok(
        /rowData\.windowReference/.test(body),
        'a saved reference must repopulate the input when editing'
    );
});

// ---------------------------------------------------------------------------
// It is read, kept, and saved
// ---------------------------------------------------------------------------

test('the reference is collected from the row', () => {
    const body = functionBody('collectProjectWindowRows');

    assert.ok(
        /windowReference:\s*safeText\(/.test(body),
        'collectProjectWindowRows must read the reference input'
    );
});

test('the reference is carried into the saved window record', () => {
    const body = functionBody('buildWindowFromRow');

    assert.ok(
        /windowReference:/.test(body),
        'buildWindowFromRow must store the reference on the window'
    );
});

test('a row holding only a reference is not treated as blank', () => {
    const body = functionBody('isBlankWindowRow');

    assert.ok(
        /!row\.windowReference/.test(body),
        'a row with only a reference must not be dropped as blank'
    );
});

// ---------------------------------------------------------------------------
// Uniqueness
// ---------------------------------------------------------------------------

test('duplicate references in one project are rejected', () => {
    const body = functionBody('validateProjectForm');

    assert.ok(
        /seenReferences/.test(body),
        'validateProjectForm must track references it has already seen'
    );

    assert.ok(
        /toLowerCase\(\)/.test(body),
        'the uniqueness check must ignore case'
    );
});

// ---------------------------------------------------------------------------
// It reaches the cloud
// ---------------------------------------------------------------------------

test('the reference is written to the windows table', () => {
    assert.ok(
        /window_reference:\s*window\.windowReference/.test(syncSource),
        'sync.js must map windowReference to the window_reference column'
    );
});

test('the reference is read back from the cloud', () => {
    assert.ok(
        /windowReference:\s*row\.window_reference/.test(syncSource),
        'sync.js must map window_reference back onto the window'
    );
});

test('the schema declares the window_reference column', () => {
    assert.ok(
        /window_reference\s+text/.test(schemaSource),
        'schema.sql must declare a window_reference column'
    );
});

test('the schema migrates an already-deployed project', () => {
    /*
       "create table if not exists" does nothing to an existing table,
       so without this alter an older project would miss the column and
       every sync carrying a reference would fail.
    */
    assert.ok(
        /alter table windows add column if not exists window_reference/.test(schemaSource),
        'schema.sql must add window_reference to an existing windows table'
    );
});

// ---------------------------------------------------------------------------
// It is visible and findable
// ---------------------------------------------------------------------------

test('the reference is shown in the window details', () => {
    const body = functionBody('buildWindowDetailsHtml');

    assert.ok(
        /item\.windowReference/.test(body),
        'the window details modal must show the reference'
    );
});

test('the scanner search matches on the reference', () => {
    const body = functionBody('renderScanSearch');

    assert.ok(
        /safeText\(item\.windowReference\)/.test(body),
        'the scanner search must match a typed reference'
    );
});
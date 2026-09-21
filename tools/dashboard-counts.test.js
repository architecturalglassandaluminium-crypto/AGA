// Unit tests for the dashboard status counts and the production pipeline.
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/dashboard-counts.test.js
//
// The dashboard once read "NaN" on the Production and Ready cards, because
// the counting code summed statuses that do not exist ("Glazed" and a bare
// "Completed") straight out of a lookup object. undefined + number is NaN,
// and NaN renders as the literal word "NaN" - so a rename in STATUSES broke
// the headline number with no error anywhere.
//
// These tests pin the counting to the real status vocabulary, so a status
// that is not tracked contributes 0 instead of poisoning a total.

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

/*
   The statuses the app actually uses, lifted from the STATUSES array so
   the test fails loudly if a name is renamed without the counts following.
*/
const statusMatch = appSource.match(/const STATUSES = \[([\s\S]*?)\];/);
assert.ok(statusMatch, 'STATUSES was not found in app.js');

const STATUSES = [...statusMatch[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);

// ---------------------------------------------------------------------------
// The vocabulary itself
// ---------------------------------------------------------------------------

test('STATUSES is not empty and holds the terminal status', () => {
    assert.ok(STATUSES.length > 1, 'STATUSES looks empty');
    // The real name is "Project Completed"; a bare "Completed" never exists.
    assert.ok(
        STATUSES.includes('Project Completed'),
        'STATUSES must carry "Project Completed"'
    );
});

test('there is no bare "Completed" status to count', () => {
    // If this ever becomes a real status the counts below would need it,
    // so failing here is the reminder rather than a silent zero.
    assert.ok(
        !STATUSES.includes('Completed'),
        'a status called exactly "Completed" now exists; update the counts'
    );
    assert.ok(
        !STATUSES.includes('Glazed'),
        'a status called exactly "Glazed" now exists; update the counts'
    );
});

// ---------------------------------------------------------------------------
// The counting helper
// ---------------------------------------------------------------------------

test('the dashboard counts through a helper that cannot produce NaN', () => {
    const body = functionBody('renderDashboard');

    assert.match(
        body,
        /const countOf =/,
        'renderDashboard must sum statuses through a helper'
    );

    // The helper must default a missing status to 0.
    assert.match(
        body,
        /counts\[status\] \|\| 0/,
        'the helper must fall back to 0 for an untracked status'
    );
});

test('no dashboard total adds a raw counts lookup', () => {
    // counts["SomeStatus"] + counts["Other"] is the exact shape that
    // produced NaN. Every total must go through countOf(...) instead.
    const body = functionBody('renderDashboard');

    const rawSum = /counts\["[^"]+"\]\s*\+/;
    assert.doesNotMatch(
        body,
        rawSum,
        'a raw counts[...] + was found; use the countOf() helper'
    );
});

// ---------------------------------------------------------------------------
// Every status the counts name must be real
// ---------------------------------------------------------------------------

test('every status named in renderDashboard exists in STATUSES', () => {
    const body = functionBody('renderDashboard');

    const named = [...body.matchAll(/countOf\(([\s\S]*?)\)/g)]
        .flatMap(match => [...match[1].matchAll(/"([^"]+)"/g)].map(m => m[1]));

    assert.ok(named.length, 'no statuses were found inside countOf(...)');

    named.forEach(status => {
        assert.ok(
            STATUSES.includes(status),
            `renderDashboard counts "${status}", which is not a real status`
        );
    });
});

test('the pipeline and the cards agree on what "production" means', () => {
    const body = functionBody('renderDashboard');

    // productionWindows and pipelineProduction must be the same sum, or the
    // card and the pipeline bar tell different stories about the same job.
    const productionCalls = [
        ...body.matchAll(/setTextIfExists\(\s*"(?:productionWindows|pipelineProduction)",\s*countOf\(([\s\S]*?)\)\s*\)/g)
    ].map(match => match[1].replace(/\s+/g, "").trim());

    assert.equal(
        productionCalls.length,
        2,
        'expected a productionWindows and a pipelineProduction countOf(...)'
    );
    assert.equal(
        productionCalls[0],
        productionCalls[1],
        'the production card and the pipeline bar count different statuses'
    );
});

test('the "done" totals agree on the terminal status', () => {
    const body = functionBody('renderDashboard');

    assert.match(
        body,
        /"readyWindows",\s*countOf\([\s\S]*?"Project Completed"/,
        'readyWindows must count the terminal "Project Completed" status'
    );
    assert.match(
        body,
        /"pipelineCompleted",\s*countOf\("Project Completed"\)/,
        'pipelineCompleted must count "Project Completed"'
    );
});

// ---------------------------------------------------------------------------
// The same bug, second site
// ---------------------------------------------------------------------------

test('the project progress chips count the terminal status', () => {
    const body = functionBody('projectStatusSummaryHtml');

    assert.match(
        body,
        /counts\["Project Completed"\]/,
        'projectStatusSummaryHtml must count "Project Completed"'
    );
    assert.doesNotMatch(
        body,
        /counts\["Completed"\]/,
        'projectStatusSummaryHtml still looks up a bare "Completed"'
    );
});

// ---------------------------------------------------------------------------
// The pipeline markup matches the ids the code writes to
// ---------------------------------------------------------------------------

test('every pipeline id the code writes exists in the markup', () => {
    const body = functionBody('renderDashboard');

    const pipelineIds = [
        ...body.matchAll(/setTextIfExists\(\s*"(pipeline[A-Za-z]+)"/g)
    ].map(match => match[1]);

    assert.ok(pipelineIds.length, 'no pipeline ids were found');

    pipelineIds.forEach(id => {
        assert.match(
            htmlSource,
            new RegExp(`id="${id}"`),
            `renderDashboard writes to #${id}, which is not in index.html`
        );
    });
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

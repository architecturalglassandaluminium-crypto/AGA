'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { collect, filter, isOverdue } = require('../portfolio.js');

function storage(values) {
    return {
        getItem(key) { return values[key] || null; }
    };
}

test('collects separate AGA, APS and APC books without mixing projects', () => {
    const projects = collect(storage({
        aga_projects: JSON.stringify([{ id: 'g1', projectNumber: 'AGA-1', projectName: 'Glass site', dueDate: '2026-01-01', windows: [{ status: 'Installed' }] }]),
        'pipewise-projects': JSON.stringify([{ id: 'p1', name: 'Pipe site', status: 'on-hold', items: [{ stage: 'Blocked' }] }]),
        'apc-projects': JSON.stringify([{ id: 'c1', name: 'Coat site', status: 'complete', items: [{ stage: 'Done' }] }])
    }));
    assert.deepEqual(projects.map(p => [p.company, p.number, p.status, p.done]), [
        ['glass', 'AGA-1', 'Complete', 1], ['plumbing', 'p1', 'On hold', 0], ['coatings', 'c1', 'Complete', 1]
    ]);
    assert.equal(filter(projects, 'plumbing', 'active', 'pipe', '2026-09-29').length, 1);
    assert.equal(filter(projects, 'all', 'complete', '', '2026-09-29').length, 2);
    assert.equal(isOverdue(projects[0], '2026-09-29'), false);
});

test('overdue means an unfinished project with a past calendar due date', () => {
    const projects = collect(storage({
        aga_projects: JSON.stringify([
            { projectName: 'Old', dueDate: '2026-09-28', windows: [] },
            { projectName: 'Today', dueDate: '2026-09-29', windows: [] }
        ])
    }));
    assert.deepEqual(filter(projects, 'all', 'overdue', '', '2026-09-29').map(p => p.name), ['Old']);
});

test('bad local data does not stop the other companies from loading', () => {
    assert.deepEqual(collect(storage({ aga_projects: '{', 'pipewise-projects': JSON.stringify([{ id: 'ok' }]) })).map(p => p.company), ['plumbing']);
});

test('portfolio is wired into the host and each existing planning app', () => {
    const root = path.resolve(__dirname, '..');
    const read = file => fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(read('index.html'), /id="portfolio-view"/);
    assert.match(read('index.html'), /src="portfolio.js"/);
    assert.match(read('trades.js'), /trade === "portfolio"/);
    for (const company of ['plumbing', 'coatings']) assert.match(read(`trades/${company}/app.js`), /window\.openPlanningProject/);
});

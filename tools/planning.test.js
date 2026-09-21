// Unit tests for the project-level production planner.
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/planning.test.js
//
// The planner plans a PROJECT, not a window. The whole job is cut,
// then the whole job is welded, and so on - each stage is a batch
// that sweeps across every window. The failure this guards against
// is a planner that quietly schedules windows independently again,
// which produces a plan that looks plausible but tells the shop to
// weld one window at a time instead of running a batch.
//
// The engine functions are pure, so they are lifted out of app.js and
// exercised directly rather than only pattern-matched.

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

/*
   Pull a top-level function's source out of app.js by name so it can
   be evaluated on its own. Brace-counting rather than a lazy regex,
   because these functions contain nested blocks and object literals.
*/
function extractFunction(name) {
    const start = appSource.indexOf(`function ${name}(`);

    assert.ok(start !== -1, `${name} was not found in app.js`);

    const bodyStart = appSource.indexOf('{', start);

    let depth = 0;

    for (let i = bodyStart; i < appSource.length; i += 1) {
        const char = appSource[i];

        if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;

            if (depth === 0) {
                return appSource.slice(start, i + 1);
            }
        }
    }

    throw new Error(`could not find the end of ${name}`);
}

const PLANNING_STAGES = [
    { key: 'measure', label: 'Measure & Check', base: 20, perSqm: 0, scales: false },
    { key: 'cut', label: 'Cutting', base: 25, perSqm: 1.5, scales: true },
    { key: 'weld', label: 'Welding & Crimping', base: 30, perSqm: 1.0, scales: true },
    { key: 'machine', label: 'Machining & Drilling', base: 20, perSqm: 0.8, scales: true },
    { key: 'assemble', label: 'Frame Assembly', base: 35, perSqm: 1.2, scales: true },
    { key: 'glaze', label: 'Glazing', base: 25, perSqm: 1.5, scales: true },
    { key: 'qc', label: 'Quality Check', base: 15, perSqm: 0, scales: false },
    { key: 'wrap', label: 'Wrapping', base: 10, perSqm: 0, scales: false },
    { key: 'install', label: 'Installation', base: 45, perSqm: 2.0, scales: true }
];

const stageDefaults = PLANNING_STAGES.reduce((acc, stage) => {
    acc[stage.key] = stage.base;
    return acc;
}, {});

/*
   Build a sandbox holding just the planner engine. `safeText` is
   stubbed because it is a display helper, not part of the maths.
*/
function loadEngine() {
    const source = [
        'const PLANNING_STAGES = ' + JSON.stringify(PLANNING_STAGES) + ';',
        'const safeText = (v) => (v === null || v === undefined) ? "" : String(v).trim();',
        'let localStorage = { getItem: () => null, setItem: () => {} };',
        'const console = { error: () => {}, warn: () => {} };',
        'const showError = () => {};',
        extractFunction('windowAreaSqm'),
        extractFunction('stageMinutesForWindow'),
        extractFunction('stageMinutesForProject'),
        extractFunction('buildProjectPlan'),
        'return { windowAreaSqm, stageMinutesForWindow, stageMinutesForProject, buildProjectPlan };'
    ].join('\n');

    return new Function(source)();
}

const engine = loadEngine();

function settings(overrides = {}) {
    return {
        parallel: 1,
        hoursPerDay: 8,
        stageMinutes: { ...stageDefaults },
        ...overrides
    };
}

function window_(length, width, id = 'w') {
    return { id, windowNumber: `AGA-WIN-${id}`, length, width, productType: 'Window' };
}

// A window of exactly 1 m^2, so the per-sqm maths is easy to reason about.
const ONE_SQM = window_(1000, 1000, '1');

function project(windows) {
    return { id: 'p1', projectName: 'Test Job', projectNumber: 'AGA-PRJ-0001', windows };
}

// ---------------------------------------------------------------------------
// A stage is a batch across the whole project
// ---------------------------------------------------------------------------

test('a stage costs its per-window time multiplied by the window count', () => {
    const single = engine.stageMinutesForProject(
        PLANNING_STAGES.find(s => s.key === 'cut'),
        [ONE_SQM],
        settings()
    );

    const four = engine.stageMinutesForProject(
        PLANNING_STAGES.find(s => s.key === 'cut'),
        [ONE_SQM, ONE_SQM, ONE_SQM, ONE_SQM],
        settings()
    );

    // The flat (non-scaling) part must scale with the number of windows.
    assert.ok(four > single, 'cutting four windows must cost more than cutting one');

    const measure = PLANNING_STAGES.find(s => s.key === 'measure');

    const measureSingle = engine.stageMinutesForProject(measure, [ONE_SQM], settings());
    const measureFour = engine.stageMinutesForProject(measure, [ONE_SQM, ONE_SQM, ONE_SQM, ONE_SQM], settings());

    assert.equal(Math.round(measureSingle), 20);
    assert.equal(Math.round(measureFour), 80, 'measuring four windows is four times one');
});

test('workstations divide the batch time, never below one station', () => {
    const stage = PLANNING_STAGES.find(s => s.key === 'cut');

    const one = engine.stageMinutesForProject(stage, [ONE_SQM, ONE_SQM], settings({ parallel: 1 }));
    const two = engine.stageMinutesForProject(stage, [ONE_SQM, ONE_SQM], settings({ parallel: 2 }));

    assert.equal(Math.round(two), Math.round(one / 2), 'two stations halve the batch');

    // A nonsense parallel setting must not divide by zero or invert the plan.
    const zero = engine.stageMinutesForProject(stage, [ONE_SQM, ONE_SQM], settings({ parallel: 0 }));
    assert.equal(Math.round(zero), Math.round(one), 'parallel 0 is treated as 1');
});

test('an empty project costs nothing for any stage', () => {
    PLANNING_STAGES.forEach(stage => {
        assert.equal(
            engine.stageMinutesForProject(stage, [], settings()),
            0,
            `${stage.label} must cost 0 with no windows`
        );
    });
});

// ---------------------------------------------------------------------------
// The stage order is sequential, not parallel
// ---------------------------------------------------------------------------

test('stages run one after another, not on top of each other', () => {
    const plan = engine.buildProjectPlan(
        project([ONE_SQM, ONE_SQM, ONE_SQM]),
        { settings: settings() }
    );

    for (let i = 1; i < plan.stages.length; i += 1) {
        const previous = plan.stages[i - 1];
        const current = plan.stages[i];

        assert.ok(
            current.startDay >= previous.endDay,
            `${current.label} starts on day ${current.startDay} but ` +
            `${previous.label} does not finish until day ${previous.endDay}`
        );
    }
});

test('the first stage starts on day 1', () => {
    const plan = engine.buildProjectPlan(project([ONE_SQM]), { settings: settings() });

    assert.equal(plan.stages[0].startDay, 1);
});

test('welding cannot begin before the cutting batch finishes', () => {
    const plan = engine.buildProjectPlan(
        project([ONE_SQM, ONE_SQM, ONE_SQM, ONE_SQM, ONE_SQM]),
        { settings: settings() }
    );

    const cut = plan.stages.find(s => s.key === 'cut');
    const weld = plan.stages.find(s => s.key === 'weld');

    assert.ok(weld.startDay >= cut.endDay, 'welding must wait for cutting to finish');
});

// ---------------------------------------------------------------------------
// The plan describes a project, not a window
// ---------------------------------------------------------------------------

test('the plan exposes one timeline, with one entry per stage', () => {
    const plan = engine.buildProjectPlan(project([ONE_SQM, ONE_SQM]), { settings: settings() });

    assert.equal(plan.stages.length, PLANNING_STAGES.length);

    plan.stages.forEach((stage, index) => {
        assert.equal(stage.key, PLANNING_STAGES[index].key, 'stage order must be preserved');
        assert.ok(typeof stage.label === 'string' && stage.label.length);
        assert.ok(Number.isFinite(stage.startDay));
        assert.ok(Number.isFinite(stage.endDay));
    });

    // The timeline must not double in length just because there are
    // two windows - that is the whole point of batching.
    const single = engine.buildProjectPlan(project([ONE_SQM]), { settings: settings() });
    assert.equal(plan.stages.length, single.stages.length);
});

test('the project span is the day the last stage ends', () => {
    const plan = engine.buildProjectPlan(project([ONE_SQM, ONE_SQM]), { settings: settings() });

    const lastEnd = plan.stages[plan.stages.length - 1].endDay;

    assert.equal(plan.spanDays, lastEnd, 'spanDays must be the last stage end');
});

test('total minutes is the sum of the stage times', () => {
    const plan = engine.buildProjectPlan(project([ONE_SQM, ONE_SQM]), { settings: settings() });

    const sum = plan.stages.reduce((total, stage) => total + stage.minutes, 0);

    assert.equal(plan.totalMinutes, sum);
});

test('windowCount reports the windows on the job', () => {
    const plan = engine.buildProjectPlan(
        project([ONE_SQM, ONE_SQM, ONE_SQM]),
        { settings: settings() }
    );

    assert.equal(plan.windowCount, 3);
    plan.stages.forEach(stage => {
        assert.equal(stage.windows, 3, 'each stage must know how many windows it covers');
    });
});

test('per-window rows are reference only, and never drive the span', () => {
    const plan = engine.buildProjectPlan(project([ONE_SQM, ONE_SQM]), { settings: settings() });

    assert.equal(plan.rows.length, 2, 'there is still a per-window reference list');

    // The rows no longer carry start/end days, because they are not scheduled.
    plan.rows.forEach(row => {
        assert.equal(row.startDay, undefined, 'a reference row must not be scheduled');
        assert.equal(row.endDay, undefined, 'a reference row must not be scheduled');
    });
});

test('a zero-minute stage still lands on a real day', () => {
    const zeroed = settings({ stageMinutes: Object.fromEntries(PLANNING_STAGES.map(s => [s.key, 0])) });

    const plan = engine.buildProjectPlan(project([ONE_SQM]), { settings: zeroed });

    plan.stages.forEach(stage => {
        assert.ok(stage.startDay >= 1, `${stage.label} must not start on day ${stage.startDay}`);
        assert.ok(stage.endDay >= stage.startDay, `${stage.label} must not end before it starts`);
    });
});

test('more windows means more time, never less', () => {
    const one = engine.buildProjectPlan(project([ONE_SQM]), { settings: settings() });
    const many = engine.buildProjectPlan(
        project([ONE_SQM, ONE_SQM, ONE_SQM, ONE_SQM, ONE_SQM, ONE_SQM]),
        { settings: settings() }
    );

    assert.ok(
        many.totalMinutes > one.totalMinutes,
        'a six-window job must take longer than a one-window job'
    );
});

// ---------------------------------------------------------------------------
// The view is project-first
// ---------------------------------------------------------------------------

test('the schedule section is titled as a project schedule', () => {
    assert.match(htmlSource, /Project Schedule/);
    assert.doesNotMatch(htmlSource, /Window Schedule/);
});

test('the planner schedules stages through the project helper', () => {
    const body = extractFunction('buildProjectPlan');

    assert.match(
        body,
        /stageMinutesForProject\(/,
        'the plan must cost stages per project'
    );
    assert.doesNotMatch(
        body,
        /laneFreeMinutes/,
        'the old per-window bench lanes are back; the plan is project-level'
    );
});

test('renderPlanningSchedule draws the project timeline', () => {
    assert.ok(
        appSource.includes('planning-timeline'),
        'the schedule must render the project timeline'
    );
    assert.doesNotMatch(
        appSource,
        /planning-window-card/,
        'the per-window card renderer is back; the schedule is project-level'
    );
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

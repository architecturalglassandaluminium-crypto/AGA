// Unit tests for the project-level, day-based production planner.
//
// Run with the Node.js built-in test runner (no dependencies required):
//     node --test tools/planning.test.js
//
// The planner plans a PROJECT in DAYS, from measurement to
// installation. Each stage takes a whole number of working days and
// the next stage starts the day after the previous one ends - the
// whole job is cut, then the whole job is welded, and so on.
//
// The failure this guards against is a planner that quietly goes
// back to scheduling per window, or that lets a stage start before
// the one it depends on has finished - both produce a plan that
// looks plausible on screen but is wrong to build to.
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

/*
   The stage list is read back out of app.js, not hard-coded here, so
   the test breaks if someone renames a stage key without the tests
   following. Only the numeric defaults are duplicated.
*/
const stagesMatch = appSource.match(/const PLANNING_STAGES = \[([\s\S]*?)\n\];/);
assert.ok(stagesMatch, 'PLANNING_STAGES was not found in app.js');

const PLANNING_STAGES = [...stagesMatch[1].matchAll(/\{([^}]*)\}/g)].map(match => {
    const row = match[1];
    const key = row.match(/key:\s*"([^"]+)"/)[1];
    const label = row.match(/label:\s*"([^"]+)"/)[1];
    const days = Number(row.match(/days:\s*(\d+)/)[1]);
    const base = Number(row.match(/base:\s*(\d+)/)[1]);
    return { key, label, days, base };
});

assert.ok(PLANNING_STAGES.length, 'no stages were parsed out of PLANNING_STAGES');

const daysDefaults = PLANNING_STAGES.reduce((acc, s) => {
    acc[s.key] = s.days;
    return acc;
}, {});

const minutesDefaults = PLANNING_STAGES.reduce((acc, s) => {
    acc[s.key] = s.base;
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
        'const console = { error: () => {}, warn: () => {} };',
        'const showError = () => {};',
        extractFunction('windowAreaSqm'),
        extractFunction('stageMinutesForWindow'),
        extractFunction('stageMinutesForProject'),
        extractFunction('stageDaysForProject'),
        extractFunction('buildProjectPlan'),
        'return { windowAreaSqm, stageMinutesForWindow, stageMinutesForProject, stageDaysForProject, buildProjectPlan };'
    ].join('\n');

    return new Function(source)();
}

const engine = loadEngine();

function settings(overrides = {}) {
    return {
        parallel: 1,
        hoursPerDay: 8,
        stageDays: { ...daysDefaults },
        stageMinutes: { ...minutesDefaults },
        ...overrides
    };
}

/* Settings with every stage day set to 0, so days must be derived. */
function derived(overrides = {}) {
    return settings({
        stageDays: Object.fromEntries(PLANNING_STAGES.map(s => [s.key, 0])),
        ...overrides
    });
}

/* Settings with explicit day counts, overriding the defaults. */
function withDays(map) {
    return settings({ stageDays: { ...daysDefaults, ...map } });
}

function window_(length, width, id = 'w') {
    return { id, windowNumber: `AGA-WIN-${id}`, length, width, productType: 'Window' };
}

// A window of exactly 1 m^2, so the per-sqm maths is easy to reason about.
const ONE_SQM = window_(1000, 1000, '1');

function project(windows) {
    return { id: 'p1', projectName: 'Test Job', projectNumber: 'AGA-PRJ-0001', windows };
}

const byKey = key => PLANNING_STAGES.find(s => s.key === key);

// ---------------------------------------------------------------------------
// Stages are planned in whole days
// ---------------------------------------------------------------------------

test('a planned day count is used as-is', () => {
    const result = engine.stageDaysForProject(byKey('cut'), [ONE_SQM], withDays({ cut: 4 }));

    assert.equal(result.days, 4);
    assert.equal(result.source, 'planned');
});

test('a fractional day count rounds up to a whole day', () => {
    // You cannot schedule half a day of cutting on a one-day calendar.
    const result = engine.stageDaysForProject(byKey('cut'), [ONE_SQM], withDays({ cut: 1.2 }));

    assert.equal(result.days, 2);
});

test('a stage on 0 days is estimated from the minutes model', () => {
    const result = engine.stageDaysForProject(byKey('cut'), [ONE_SQM], derived());

    assert.ok(result.days >= 1, 'a stage with work must take at least a day');
    assert.equal(result.source, 'derived');
});

test('a derived stage still takes at least one full day', () => {
    // A single tiny window is minutes of work, but it is still a day
    // on the plan - you cannot do it in zero days.
    const result = engine.stageDaysForProject(byKey('cut'), [ONE_SQM], derived());

    assert.equal(result.days, 1);
    assert.equal(result.source, 'derived');
});

test('a bigger batch of windows pushes a derived stage past one day', () => {
    const many = Array.from({ length: 40 }, (_, i) => window_(2000, 2000, String(i)));

    const result = engine.stageDaysForProject(byKey('cut'), many, derived());

    assert.ok(result.days > 1, '40 large windows cannot be cut in a single day');
});

test('an empty project plans no days for any stage', () => {
    PLANNING_STAGES.forEach(stage => {
        const result = engine.stageDaysForProject(stage, [], derived());

        assert.equal(result.days, 0, `${stage.label} must take 0 days with no windows`);
    });
});

// ---------------------------------------------------------------------------
// Stages run end to end, measurement through to installation
// ---------------------------------------------------------------------------

test('the plan runs from measurement to installation', () => {
    const plan = engine.buildProjectPlan(project([ONE_SQM, ONE_SQM]), { settings: settings() });

    assert.equal(plan.stages[0].key, 'measure', 'the plan must start at measurement');
    assert.equal(
        plan.stages[plan.stages.length - 1].key,
        'install',
        'the plan must end at installation'
    );
});

test('stages run one after another, never overlapping', () => {
    const plan = engine.buildProjectPlan(
        project([ONE_SQM, ONE_SQM, ONE_SQM]),
        { settings: settings() }
    );

    for (let i = 1; i < plan.stages.length; i += 1) {
        const previous = plan.stages[i - 1];
        const current = plan.stages[i];

        assert.ok(
            current.startDay > previous.endDay,
            `${current.label} starts on day ${current.startDay} but ` +
            `${previous.label} ends on day ${previous.endDay}; they overlap`
        );
    }
});

test('the first stage starts on working day 1', () => {
    const plan = engine.buildProjectPlan(project([ONE_SQM]), { settings: settings() });

    assert.equal(plan.stages[0].startDay, 1);
});

test('each stage ends the day its day count implies', () => {
    const plan = engine.buildProjectPlan(project([ONE_SQM]), { settings: withDays({ measure: 2, cut: 3 }) });

    const measure = plan.stages.find(s => s.key === 'measure');
    const cut = plan.stages.find(s => s.key === 'cut');

    assert.equal(measure.startDay, 1);
    assert.equal(measure.endDay, 2);

    assert.equal(cut.startDay, 3, 'cutting starts the day after measuring ends');
    assert.equal(cut.endDay, 5);
});

test('a longer stage pushes everything after it later', () => {
    const quick = engine.buildProjectPlan(project([ONE_SQM]), { settings: withDays({ cut: 1 }) });
    const slow = engine.buildProjectPlan(project([ONE_SQM]), { settings: withDays({ cut: 5 }) });

    const quickInstall = quick.stages.find(s => s.key === 'install');
    const slowInstall = slow.stages.find(s => s.key === 'install');

    assert.ok(
        slowInstall.startDay > quickInstall.startDay,
        'five days of cutting must delay installation against one day'
    );
});

test('the project span is the total of every stage day', () => {
    const plan = engine.buildProjectPlan(
        project([ONE_SQM, ONE_SQM]),
        { settings: withDays({ measure: 1, cut: 2, weld: 2 }) }
    );

    const totalDays = plan.stages.reduce((sum, stage) => sum + stage.days, 0);

    assert.equal(plan.spanDays, totalDays, 'the span is the sum of the stage days');
    assert.equal(plan.spanDays, plan.stages[plan.stages.length - 1].endDay);
});

test('the span breaks down into whole weeks and a remainder', () => {
    const forced = engine.buildProjectPlan(
        project([ONE_SQM]),
        { settings: withDays({ measure: 12 }) }
    );

    assert.equal(forced.spanWeeks, Math.floor(forced.spanDays / 5));
    assert.equal(forced.spanRemainderDays, forced.spanDays % 5);

    // The split must always reassemble to the whole span.
    assert.equal(forced.spanWeeks * 5 + forced.spanRemainderDays, forced.spanDays);
    assert.ok(forced.spanDays > 0);
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
        assert.ok(Number.isFinite(stage.days) && stage.days >= 0);
    });

    // The timeline must not lengthen just because there are two
    // windows - there is one stage per step, not per window.
    const single = engine.buildProjectPlan(project([ONE_SQM]), { settings: settings() });
    assert.equal(plan.stages.length, single.stages.length);
});

test('the stage breakdown carries the day counts through', () => {
    // stageTotals is what the view renders from. When it dropped the
    // day fields, every stage showed "0 days" against the real total
    // and the share maths divided by undefined - the panel read NaN
    // while the timeline beside it was perfectly correct.
    const plan = engine.buildProjectPlan(
        project([ONE_SQM, ONE_SQM]),
        { settings: withDays({ cut: 3 }) }
    );

    assert.equal(plan.stageTotals.length, plan.stages.length);

    plan.stageTotals.forEach((total, index) => {
        const stage = plan.stages[index];

        assert.equal(total.key, stage.key);
        assert.equal(
            total.days,
            stage.days,
            `${total.label} lost its day count in the breakdown`
        );
        assert.equal(
            total.daySource,
            stage.daySource,
            `${total.label} lost its day source in the breakdown`
        );
    });
});

test('the stage breakdown day counts are real numbers', () => {
    // A NaN here renders as "NaN%" and "0 days" - the exact symptom
    // of the breakdown losing its day data.
    const plan = engine.buildProjectPlan(project([ONE_SQM]), { settings: settings() });

    plan.stageTotals.forEach(total => {
        assert.ok(
            Number.isFinite(total.days),
            `${total.label} has a non-finite day count: ${total.days}`
        );
    });
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

test('each stage records whether its days were planned or derived', () => {
    const plan = engine.buildProjectPlan(
        project([ONE_SQM]),
        { settings: withDays({ measure: 2 }) }
    );

    plan.stages.forEach(stage => {
        assert.ok(
            stage.daySource === 'planned' || stage.daySource === 'derived',
            `${stage.label} has an unexpected source "${stage.daySource}"`
        );
    });

    assert.equal(plan.stages.find(s => s.key === 'measure').daySource, 'planned');
});

test('per-window rows are reference only, and never scheduled', () => {
    const plan = engine.buildProjectPlan(project([ONE_SQM, ONE_SQM]), { settings: settings() });

    assert.equal(plan.rows.length, 2, 'there is still a per-window reference list');

    plan.rows.forEach(row => {
        assert.equal(row.startDay, undefined, 'a reference row must not be scheduled');
        assert.equal(row.endDay, undefined, 'a reference row must not be scheduled');
    });
});

test('a zero-day stage still lands on a real day', () => {
    const zeroed = settings({
        stageDays: Object.fromEntries(PLANNING_STAGES.map(s => [s.key, 0]))
    });

    const plan = engine.buildProjectPlan(project([]), { settings: zeroed });

    plan.stages.forEach(stage => {
        assert.ok(stage.startDay >= 1, `${stage.label} must not start on day ${stage.startDay}`);
        assert.ok(stage.endDay >= stage.startDay, `${stage.label} must not end before it starts`);
    });
});

test('more windows never shortens a derived plan', () => {
    const one = engine.buildProjectPlan(project([ONE_SQM]), { settings: derived() });
    const many = engine.buildProjectPlan(
        project(Array.from({ length: 30 }, (_, i) => window_(2000, 2000, String(i)))),
        { settings: derived() }
    );

    assert.ok(
        many.spanDays >= one.spanDays,
        'a thirty-window job must not plan shorter than a one-window job'
    );
});

test('a deliberate day plan ignores the window count', () => {
    // If every stage is planned in days, adding windows must not move
    // the dates - the workshop has said how long it takes.
    const dayPlan = withDays(Object.fromEntries(PLANNING_STAGES.map(s => [s.key, 1])));

    const one = engine.buildProjectPlan(project([ONE_SQM]), { settings: dayPlan });
    const many = engine.buildProjectPlan(
        project(Array.from({ length: 20 }, (_, i) => window_(2000, 2000, String(i)))),
        { settings: dayPlan }
    );

    assert.equal(many.spanDays, one.spanDays);
    assert.equal(many.spanDays, PLANNING_STAGES.length, 'one day per stage');
});

// ---------------------------------------------------------------------------
// The view and settings are day-first
// ---------------------------------------------------------------------------

test('the view titles the stage breakdown by days', () => {
    assert.match(htmlSource, /Days by Stage/);
    assert.doesNotMatch(htmlSource, /Time by Stage/);
});

test('the view titles the schedule as a project schedule', () => {
    assert.match(htmlSource, /Project Schedule/);
    assert.doesNotMatch(htmlSource, /Window Schedule/);
});

test('the settings panel edits days and minutes per stage', () => {
    assert.match(htmlSource, /Plan Days per Stage/);

    assert.match(
        appSource,
        /data-stage-days=/,
        'the settings panel must offer a days input'
    );
    assert.match(
        appSource,
        /data-stage-minutes=/,
        'the settings panel must keep the minutes fallback input'
    );

    const collect = extractFunction('collectPlanningSettings');
    assert.match(collect, /settings\.stageDays\[key\]/, 'days must be read back from the panel');
});

test('the planner schedules whole days through the project helper', () => {
    const body = extractFunction('buildProjectPlan');

    assert.match(
        body,
        /stageDaysForProject\(/,
        'the plan must take its day counts from the project helper'
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

// -------------------------------------------------------------------------
// Working days skip weekends, including at the start
// -------------------------------------------------------------------------

/*
   addWorkingDays is pure, so it is built on its own and asked
   directly. Dates are chosen so the weekday is unambiguous:
   2025-09-20 is a Saturday.
*/
function loadWorkingDays() {
    return new Function(`${extractFunction('addWorkingDays')}; return addWorkingDays;`)();
}

const addWorkingDays = loadWorkingDays();

const weekdayOf = iso => new Date(`${iso}T00:00:00`).getDay();

function assertNoWeekend(iso, note) {
    const day = weekdayOf(iso);
    assert.ok(
        day !== 0 && day !== 6,
        `${note}: ${iso} falls on a weekend`
    );
}

test('a plan starting on a Saturday begins on the Monday', () => {
    // 2025-09-20 is a Saturday. A plan cannot start on a weekend.
    const first = addWorkingDays('2025-09-20', 1);

    assert.equal(first, '2025-09-22', 'the first working day after Saturday is Monday');
    assertNoWeekend(first, 'weekend start');
});

test('a plan starting on a Sunday begins on the Monday', () => {
    assert.equal(addWorkingDays('2025-09-21', 1), '2025-09-22');
});

test('a weekday start is left where it is', () => {
    // 2025-09-19 is a Friday; day 1 is that Friday, not the Monday.
    assert.equal(addWorkingDays('2025-09-19', 1), '2025-09-19');
});

test('working days step over the weekend', () => {
    // From Friday: day 2 is the Monday, and it is still Monday-ward.
    assert.equal(addWorkingDays('2025-09-19', 2), '2025-09-22');
    assert.equal(addWorkingDays('2025-09-19', 3), '2025-09-23');
});

test('no working day ever lands on a weekend', () => {
    // The whole span of a long plan is checked, from a weekend start,
    // so a mis-step anywhere in the sequence is caught.
    for (let days = 1; days <= 30; days += 1) {
        assertNoWeekend(addWorkingDays('2025-09-20', days), `day ${days}`);
    }
});

test('adding no days returns the first working day', () => {
    assert.equal(addWorkingDays('2025-09-20', 0), '2025-09-22');
});

test('an unreadable start date returns an empty string', () => {
    assert.equal(addWorkingDays('not-a-date', 3), '');
    assert.equal(addWorkingDays('', 3), '');
});

test('the day formatter is exposed and reads naturally', () => {
    const source = extractFunction('formatDays');

    assert.match(source, /day/, 'formatDays must label its output in days');

    // Evaluated on its own so the wording is asserted, not just its shape.
    const formatDays = new Function(`${source}; return formatDays;`)();

    assert.equal(formatDays(1), '1 day');
    assert.equal(formatDays(2), '2 days');
    assert.equal(formatDays(0), '0 days');
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

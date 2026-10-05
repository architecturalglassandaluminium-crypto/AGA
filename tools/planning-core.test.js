// Unit tests for planning-core.js - the shared multi-site, staff-aware
// scheduler that all three companies use.
//
// Run with the Node.js built-in test runner (no dependencies):
//     node --test tools/planning-core.test.js
//
// This is deliberately a separate file from planning.test.js. That one
// covers AGA's existing per-project DAY planner (stage chains,
// measurement to installation) and pulls its functions out of app.js.
// This one covers the new core, which is a different model: named
// staff, real capacity, several sites at once, and work that genuinely
// runs in parallel.
//
// The engine is pure, so it is loaded and exercised directly rather
// than through a browser - a scheduling bug is a wrong answer on
// screen, and the only way to be sure of the answer is to test it.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'planning-core.js'));

/* ---------------------------------------------------------------
   A Monday, deliberately. Every expected date below depends on it:
   2026-01-05 is a Monday, so the next working day is the 6th and a
   weekend is never a start.
   --------------------------------------------------------------- */
const MONDAY = '2026-01-05';

const staff = (...names) =>
    names.map((name, i) => ({ id: `s${i + 1}`, name, hoursPerDay: 7 }));

const item = (task, durationMinutes, assignees = [], extra = {}) => ({
    id: `i-${task}`,
    task,
    durationMinutes,
    assignees,
    ...extra
});

/* ---------------------------------------------------------------
   TIME
   --------------------------------------------------------------- */

test('a weekend is never a start date', () => {
    // 2026-01-10 is a Saturday.
    assert.equal(P.nextWorkingDay('2026-01-09'), '2026-01-12');
    assert.equal(P.nextWorkingDay('2026-01-10'), '2026-01-12');
});

test('addWorkingDays skips weekends', () => {
    // Five working days from Monday the 5th is Monday the 12th, not Saturday.
    assert.equal(P.addWorkingDays(MONDAY, 5), '2026-01-12');
    assert.equal(P.addWorkingDays(MONDAY, 1), '2026-01-06');
});

test('a date parses and formats in local time without an off-by-one', () => {
    /*
       new Date("2026-01-08") is midnight UTC, which is 02:00 in South
       Africa; formatting that back can give the 7th. This is the bug
       the local parsing exists to prevent, and it is invisible in a
       browser set to UTC.
    */
    const parsed = P.parseLocalDate('2026-01-08');
    assert.equal(P.formatLocalDate(parsed), '2026-01-08');
    assert.equal(parsed.getDate(), 8);
});

test('working minutes between two dates are inclusive of both', () => {
    assert.equal(
        P.workingMinutesBetween(MONDAY, MONDAY),
        P.WORKING_MINUTES_PER_DAY
    );
    assert.equal(
        P.workingMinutesBetween(MONDAY, '2026-01-06'),
        P.WORKING_MINUTES_PER_DAY * 2
    );
});

test('dates the wrong way round are read the sensible way', () => {
    assert.equal(
        P.workingMinutesBetween('2026-01-06', MONDAY),
        P.workingMinutesBetween(MONDAY, '2026-01-06')
    );
});

/* ---------------------------------------------------------------
   THE CORE CLAIM: two staff, work in parallel
   --------------------------------------------------------------- */

test('one person cannot be in two places at once', () => {
    /*
       Two full-day items, one person. This is the thing the old
       scheduler could not express: it had a single cursor walking
       tasks in order, so concurrency was impossible by construction.
    */
    const plan = P.buildPlan(
        [item('Fit frame', 420, ['s1']), item('Glaze', 420, ['s1'])],
        { staff: staff('Pieter'), startDate: MONDAY }
    );

    const [first, second] = plan.assignments;
    assert.equal(first.start, MONDAY);
    assert.notEqual(
        second.start,
        first.start,
        'one person was scheduled on two items on the same day'
    );
});

test('two people can do two items on the same day', () => {
    const plan = P.buildPlan(
        [item('Fit frame', 420, ['s1']), item('Glaze', 420, ['s2'])],
        { staff: staff('Pieter', 'Sipho'), startDate: MONDAY }
    );

    assert.equal(plan.assignments[0].start, MONDAY);
    assert.equal(
        plan.assignments[1].start,
        MONDAY,
        'two different staff were not scheduled in parallel'
    );
});

test('two people on one item finish it in half the wall time', () => {
    /*
       420 minutes of work is a full day for one person and half a day
       for two. Work is DIVIDED between assignees, not multiplied: four
       people do not do four times the work, they do the same work in
       a quarter of the time.
    */
    const plan = P.buildPlan(
        [item('Lift and place', 420, ['s1', 's2'])],
        { staff: staff('Pieter', 'Sipho'), startDate: MONDAY }
    );

    assert.equal(plan.assignments[0].wallMinutes, 210);
    assert.equal(plan.assignments[0].days, 1);
});

test('one busy person blocks their item even if the other is free', () => {
    /*
       s1 is booked all Monday. An item needing s1 AND s2 must wait,
       because s1 is the constraint - s2's spare capacity is no use to
       an item that needs them both.
    */
    const plan = P.buildPlan(
        [item('Fit frame', 420, ['s1']), item('Glaze', 420, ['s1', 's2'])],
        { staff: staff('Pieter', 'Sipho'), startDate: MONDAY }
    );

    const [first, second] = plan.assignments;
    assert.equal(first.start, MONDAY);
    assert.equal(
        second.start,
        '2026-01-06',
        'an item was scheduled on a day one of its people was already full'
    );
});

test('a partly free day is used', () => {
    /*
       s1 has 120 minutes left on the Monday. A 120-minute item fits
       in that gap rather than being pushed to Tuesday, which is what
       makes packing work at all.
    */
    const plan = P.buildPlan(
        [item('Long job', 300, ['s1']), item('Short job', 120, ['s1'])],
        { staff: staff('Pieter'), startDate: MONDAY }
    );

    assert.equal(plan.assignments[0].start, MONDAY);
    assert.equal(
        plan.assignments[1].start,
        MONDAY,
        'a 120-minute job was pushed off a day with 120 minutes free'
    );
});

/* ---------------------------------------------------------------
   CAPACITY
   --------------------------------------------------------------- */

test('a job bigger than one day starts on day one and spans', () => {
    /*
       s2 works a 3.5h day (210 minutes) and the job is 300 minutes.

       There is no arrangement in which 300 minutes fit inside 210, so
       the scheduler used to skip forward a day at a time looking for
       room that could never exist - and placed the job in January of
       the following year. That is the failure this pins down.

       The right answer is to start it on the first working day and
       let it span, so the plan shows the truth: the job needs more
       than the day the person is there for, and the planner has to
       decide what to do about it.
    */
    const plan = P.buildPlan([item('Oversized job', 300, ['s2'])], {
        staff: [{ id: 's2', name: 'Half day', hoursPerDay: 3.5 }],
        startDate: MONDAY
    });

    const [assignment] = plan.assignments;

    assert.equal(assignment.start, MONDAY, 'an impossible job was pushed weeks ahead');
    assert.equal(assignment.days, 2, 'a job larger than a day did not span two days');
    assert.equal(assignment.finish, '2026-01-06');
    assert.equal(assignment.multiDay, true);
});

test('a multi-day job gives capacity back on the days it rolls on', () => {
    /*
       A two-day job must book day one and day two, not the whole
       length against day one. Booking it all on day one over-books
       the person on a day they were finishing, and leaves the second
       day looking free - so a second two-day job would be stacked on
       top of the first.
    */
    const plan = P.buildPlan(
        [item('Two day job', 500, ['s1'])],
        { staff: staff('Pieter'), startDate: MONDAY }
    );

    const ledger = plan.ledger;
    assert.equal(ledger.get('s1', MONDAY), 420, 'day one was not fully booked');
    assert.equal(
        ledger.get('s1', '2026-01-06'),
        80,
        'the second day of a two-day job was not booked'
    );
});

test('a job that exactly fills a short day is accepted', () => {
    /*
       210 minutes into 210 minutes is a full day, not an overrun. A
       strict ">" would push this to the next day and silently cost
       every half-day worker a day a week.
    */
    const plan = P.buildPlan(
        [item('Fits exactly', 210, ['s2'])],
        {
            staff: [{ id: 's2', name: 'Half day', hoursPerDay: 3.5 }],
            startDate: MONDAY
        }
    );

    assert.equal(plan.assignments[0].start, MONDAY);
    assert.ok(
        !plan.warnings.some(w => w.type === 'overbooked'),
        'a day booked to exactly capacity was reported as overbooked'
    );
});

/* ---------------------------------------------------------------
   PINNED STARTS
   --------------------------------------------------------------- */

test('a pinned start is honoured and everything else works around it', () => {
    const plan = P.buildPlan(
        [
            item('Early task', 420, ['s1']),
            item('Pinned task', 420, ['s2'], {
                start: '2026-01-13',
                startPinned: true
            })
        ],
        { staff: staff('Pieter', 'Sipho'), startDate: MONDAY }
    );

    const pinned = plan.assignments.find(a => a.task === 'Pinned task');
    assert.equal(pinned.start, '2026-01-13');
});

test('a pinned item is scheduled first, whatever its priority', () => {
    /*
       A pin is a promise about the real world - the crew is there
       that day - so it is laid down before anything is placed around
       it.
    */
    const plan = P.buildPlan(
        [
            item('Normal', 420, ['s1'], { priority: 1 }),
            item('Pinned', 420, ['s1'], {
                start: '2026-01-13',
                startPinned: true,
                priority: 99
            })
        ],
        { staff: staff('Pieter'), startDate: MONDAY }
    );

    const pinned = plan.assignments.find(a => a.task === 'Pinned');
    const normal = plan.assignments.find(a => a.task === 'Normal');
    assert.equal(pinned.start, '2026-01-13');
    assert.notEqual(
        normal.start,
        '2026-01-13',
        'unpinned work was scheduled onto a pinned crew day'
    );
});

/* ---------------------------------------------------------------
   WARNINGS - the silent-failure guards
   --------------------------------------------------------------- */

test('unassigned work is reported, not scheduled silently', () => {
    const plan = P.buildPlan([item("Nobody's job", 420, [])], {
        staff: staff('Pieter'),
        startDate: MONDAY
    });

    const warning = plan.warnings.find(w => w.type === 'unassigned');
    assert.ok(warning, 'work with nobody to do it was not reported');
    assert.match(warning.message, /Nobody's job/);
});

test('an assignee who is not on the roster is reported', () => {
    const plan = P.buildPlan([item('Job', 420, ['s1', 'ghost'])], {
        staff: staff('Pieter'),
        startDate: MONDAY
    });

    const warning = plan.warnings.find(w => w.type === 'unknown-assignee');
    assert.ok(warning, 'an unknown assignee was not reported');
    assert.match(warning.message, /ghost/);
});

test('work is still scheduled when one of two assignees has left', () => {
    /*
       Treated as a single-constraint job rather than as two.
       Treating an inactive person as full would deadlock the item
       off the end of the plan, which makes a scheduler useless.

       The second half matters just as much: the item's DURATION was
       divided by two when both people were expected, so with one gone
       it has to be re-divided by one. A scheduler that keeps the
       halved duration is quietly telling the planner a job takes half
       the time it does.
    */
    const plan = P.buildPlan([item('Job', 420, ['s1', 'gone'])], {
        staff: [
            { id: 's1', name: 'Pieter', hoursPerDay: 7 },
            { id: 'gone', name: 'Departed', active: false }
        ],
        startDate: MONDAY
    });

    const [assignment] = plan.assignments;

    assert.equal(assignment.start, MONDAY);
    assert.deepEqual(assignment.schedulable, ['s1']);
    /* One person on 420 minutes of work is a full day, not half. */
    assert.equal(assignment.wallMinutes, 420);
    assert.ok(
        plan.warnings.some(w => w.type === 'inactive-assignee'),
        'losing an assignee was not reported'
    );
});

/* ---------------------------------------------------------------
   DETERMINISM - the property that makes a plan trustworthy
   --------------------------------------------------------------- */

test('the same input always produces the same plan', () => {
    const build = () =>
        P.buildPlan(
            [
                item('A', 300, ['s1']),
                item('B', 420, ['s2']),
                item('C', 200, ['s1', 's2']),
                item('D', 420, ['s3'])
            ],
            { staff: staff('A', 'B', 'C', 'D'), startDate: MONDAY }
        ).assignments.map(a => `${a.task}:${a.start}:${a.finish}`);

    const first = build();
    for (let i = 0; i < 5; i++) {
        assert.deepEqual(build(), first, 'the plan changed between identical runs');
    }
});

/* ---------------------------------------------------------------
   MULTI-SITE
   --------------------------------------------------------------- */

test('several sites are planned at once', () => {
    const plan = P.buildPlan(
        [
            item('Ground floor', 420, ['s1'], { siteId: 'a' }),
            item('First floor', 420, ['s2'], { siteId: 'b' })
        ],
        { staff: staff('Pieter', 'Sipho'), startDate: MONDAY }
    );

    const board = P.buildSiteBoard(plan, [
        { id: 'a', name: 'Ground floor' },
        { id: 'b', name: 'First floor' }
    ]);

    assert.equal(board.rows.length, 2);
    assert.equal(board.rows[0].itemCount, 1);
    assert.equal(board.rows[1].itemCount, 1);
});

test('staff with no work are reported as idle', () => {
    const plan = P.buildPlan(
        [item('One job', 420, ['s1'], { siteId: 'a' })],
        { staff: staff('Busy', 'Spare'), startDate: MONDAY }
    );

    const board = P.buildSiteBoard(plan, [{ id: 'a', name: 'Site A' }]);
    assert.deepEqual(board.idle.map(p => p.name), ['Spare']);
});

test('capacity is reported per person per day', () => {
    const plan = P.buildPlan(
        [
            item('A', 420, ['s1'], { siteId: 'a' }),
            item('B', 420, ['s2'], { siteId: 'b' })
        ],
        { staff: staff('Pieter', 'Sipho'), startDate: MONDAY }
    );

    const capacity = P.capacityByPerson(plan, MONDAY, 3);
    assert.equal(capacity.length, 2);

    const pieter = capacity.find(c => c.staff.name === 'Pieter');
    assert.equal(pieter.days[0].minutes, 420);
    assert.equal(pieter.days[0].free, 0);
    assert.equal(pieter.days[1].minutes, 0);
});

/* ---------------------------------------------------------------
   THE CALENDAR VIEW
   --------------------------------------------------------------- */

test('the calendar lists working days with what is on them', () => {
    const plan = P.buildPlan(
        [
            item('Fit frames', 420, ['s1'], { siteId: 'x' }),
            item('Glaze', 420, ['s2'], { siteId: 'x' })
        ],
        { staff: staff('Pieter', 'Sipho'), startDate: MONDAY }
    );

    const calendar = P.buildCalendar(plan, { dayCount: 5 });

    assert.equal(calendar.days.length, 5);
    /* The FIRST day is the start date itself. The calendar used to
       begin at the next working day, so a full day of work booked on
       the Monday showed 0h against Monday and the work against
       Tuesday - the strip and the schedule disagreed by a day. */
    assert.equal(calendar.days[0].date, MONDAY);

    const first = calendar.days[0];
    assert.equal(first.itemCount, 2);
    assert.equal(first.crew.length, 2);
    assert.equal(first.bookedMinutes, 840);
});

test('the calendar never contains a weekend', () => {
    const plan = P.buildPlan([item('Job', 420, ['s1'])], {
        staff: staff('Pieter'),
        startDate: '2026-01-09'
    });

    const calendar = P.buildCalendar(plan, { dayCount: 5 });
    calendar.days.forEach(day => {
        assert.ok(
            !P.isWeekend(P.parseLocalDate(day.date)),
            `${day.date} is a weekend and should not be in the plan`
        );
    });
});

test('a multi-day job is running on each day it spans', () => {
    const plan = P.buildPlan([item('Three day job', 900, ['s1'])], {
        staff: staff('Pieter'),
        startDate: MONDAY
    });

    const calendar = P.buildCalendar(plan, { dayCount: 4 });
    /* Starts once, runs for three days. */
    assert.equal(calendar.days[0].starting.length, 1);
    assert.equal(calendar.days[1].running.length, 1);
    assert.equal(calendar.days[2].running.length, 1);
    /* Nothing left on the fourth. */
    assert.equal(calendar.days[3].running.length, 0);
});

test('an empty plan produces an empty calendar rather than throwing', () => {
    const plan = P.buildPlan([], { staff: [], startDate: MONDAY });
    const calendar = P.buildCalendar(plan, { dayCount: 10 });
    assert.equal(calendar.days.length, 0);
});

test('a month grid starts on a Monday and ends on a whole week', () => {
    /*
       January 2026: the 1st is a Thursday, so the grid needs four
       blank cells before it, and the month ends on the 31st which is
       a Saturday.
    */
    const cells = P.monthGrid(2026, 1);
    assert.ok(cells.length % 7 === 0, 'the grid does not end on a whole week');
    assert.equal(cells[0].date, '', 'the grid does not begin with leading blanks');

    const firstOfMonth = cells.find(c => c.inMonth);
    assert.equal(firstOfMonth.date, '2026-01-01');

    const monthCells = cells.filter(c => c.inMonth);
    assert.equal(monthCells.length, 31);
    assert.ok(monthCells.some(c => c.weekend), 'no weekend is flagged');
});

/* ---------------------------------------------------------------
   THE TIMELINE VIEW
   --------------------------------------------------------------- */

test('a timeline bar spans working days, not calendar days', () => {
    /*
       A job running Monday to Wednesday is three working days and
       draws three columns wide - even though it covers five calendar
       days once the weekend is counted. A timeline measured in
       calendar days makes every short job look like it has a gap in
       the middle of it.
    */
    const plan = P.buildPlan([item('Three day job', 900, ['s1'])], {
        staff: staff('Pieter'),
        startDate: MONDAY
    });

    const timeline = P.buildTimeline(plan);

    assert.equal(timeline.axisStart, MONDAY);
    assert.equal(timeline.axisEnd, '2026-01-07');
    assert.equal(timeline.columns.length, 3);
    assert.deepEqual(timeline.columns, [
        '2026-01-05',
        '2026-01-06',
        '2026-01-07'
    ]);

    const [row] = timeline.rows;
    assert.equal(row.fromColumn, 0);
    assert.equal(row.toColumn, 2);
    assert.equal(row.spanColumns, 3);
});

test('two items on the same day share a column', () => {
    const plan = P.buildPlan(
        [item('A', 420, ['s1']), item('B', 420, ['s2'])],
        { staff: staff('Pieter', 'Sipho'), startDate: MONDAY }
    );

    const timeline = P.buildTimeline(plan);
    assert.equal(timeline.rows[0].fromColumn, timeline.rows[1].fromColumn);
    assert.equal(timeline.rows[0].fromColumn, 0);
});

test('a timeline axis covers the plan, not the guard limit', () => {
    /*
       A one-day job used to produce an 800-column axis - three years
       of scroll for a morning's work. The axis must end at the last
       finish.
    */
    const plan = P.buildPlan([item('Morning', 420, ['s1'])], {
        staff: staff('Pieter'),
        startDate: MONDAY
    });

    const timeline = P.buildTimeline(plan);
    assert.equal(timeline.columns.length, 1, 'the axis ran past the plan');
});

test('timeline rows are grouped by site', () => {
    const plan = P.buildPlan(
        [
            item('Frame', 420, ['s1'], { siteId: 'x' }),
            item('Glaze', 420, ['s2'], { siteId: 'x' }),
            item('Plaster', 420, ['s1'], { siteId: 'y' })
        ],
        { staff: staff('Pieter', 'Sipho'), startDate: MONDAY }
    );

    const timeline = P.buildTimeline(plan);
    assert.equal(timeline.groups.length, 2);

    const x = timeline.groups.find(g => g.siteId === 'x');
    assert.equal(x.rows.length, 2);
    assert.equal(x.start, MONDAY);
});

test('a timeline can be narrowed to one site', () => {
    const plan = P.buildPlan(
        [
            item('Frame', 420, ['s1'], { siteId: 'x' }),
            item('Plaster', 420, ['s2'], { siteId: 'y' })
        ],
        { staff: staff('Pieter', 'Sipho'), startDate: MONDAY }
    );

    const timeline = P.buildTimeline(plan, { siteId: 'x' });
    assert.equal(timeline.rows.length, 1);
    assert.equal(timeline.rows[0].task, 'Frame');
});

test('the project timeline reports every site', () => {
    const plan = P.buildPlan(
        [
            item('Frame', 420, ['s1'], { siteId: 'x' }),
            item('Plaster', 420, ['s2'], { siteId: 'y' })
        ],
        { staff: staff('Pieter', 'Sipho'), startDate: MONDAY }
    );

    const timeline = P.buildProjectTimeline(plan, [
        { id: 'x', name: 'Ground floor' },
        { id: 'y', name: 'First floor' },
        { id: 'z', name: 'Second floor' }
    ]);

    assert.equal(timeline.sites.length, 3, 'a site with no work was left off the board');
    assert.equal(timeline.sites[0].site.name, 'Ground floor');
    assert.equal(timeline.sites[2].itemCount, 0);
});

test('the timeline survives a plan with nothing in it', () => {
    const plan = P.buildPlan([], { staff: [], startDate: MONDAY });
    assert.doesNotThrow(() => P.buildTimeline(plan));
    assert.doesNotThrow(() => P.buildCalendar(plan));
    assert.doesNotThrow(() => P.buildProjectTimeline(plan, []));
});

/* ---------------------------------------------------------------
   ROBUSTNESS
   --------------------------------------------------------------- */

test('empty input does not throw', () => {
    const plan = P.buildPlan([], { staff: [], startDate: MONDAY });
    assert.deepEqual(plan.assignments, []);
    assert.equal(plan.span.days, 0);
    assert.doesNotThrow(() => P.buildSiteBoard(plan, []));
    assert.doesNotThrow(() => P.capacityByPerson(plan, MONDAY, 5));
});

test('garbage input does not throw', () => {
    assert.doesNotThrow(() =>
        P.buildPlan([null, {}, { task: 'x' }], { staff: [null, {}] })
    );
    assert.doesNotThrow(() => P.buildPlan(null, null));
    assert.doesNotThrow(() => P.buildPlan(undefined, undefined));
});

test('a zero-duration item is dropped rather than scheduled', () => {
    const plan = P.buildPlan(
        [item('Nothing', 0, ['s1']), item('Something', 420, ['s1'])],
        { staff: staff('Pieter'), startDate: MONDAY }
    );

    assert.equal(plan.assignments.length, 1);
    assert.equal(plan.assignments[0].task, 'Something');
});

test('an item with no start date still gets a plan', () => {
    const plan = P.buildPlan([item('Job', 420, ['s1'])], {
        staff: staff('Pieter')
    });

    assert.ok(plan.assignments[0].start, 'no start date given and none produced');
});

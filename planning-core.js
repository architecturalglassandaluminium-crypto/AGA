/* =========================================================
   PLANNING CORE
   ---------------------------------------------------------
   One scheduling engine for all three companies.

   THE PROBLEM IT SOLVES
   ---------------------
   Each app had its own planning code, and none of them could answer
   the two questions the office actually asks:

     "We have three sites running at once - who is where, and can
      the crew get to all of them?"

     "Four of us are on site this week - which of these line items
      can two people be doing at the same time?"

   The old scheduler could answer neither. It had ONE cursor walking
   ONE project's tasks in order (autoScheduleItems), so two tasks were
   never concurrent by construction, and there was no notion of a
   person: "parallel" was a single number describing how many people
   work on the job as a whole, not who they are.

   THE MODEL
   ---------
   Three things, deliberately separate:

     SITE     a place of work. A project may have several (a housing
              block has a ground-floor and a first-floor site; a
              contract is several sites entirely). Each site has its
              own tasks.

     STAFF    a person, with a daily capacity in hours and a trade.
              Capacity is per person, not per project - that is what
              lets the same person be on two sites in one day.

     ITEM     a line of work: a task from a project's quote or
              schedule. Assigned to one or more staff.

   A plan is produced by walking the items in priority order and
   giving each the earliest slot where ALL its assigned staff have
   room. Two items with different staff can therefore overlap; two
   items needing the same person cannot.

   WHY IT IS A SEPARATE FILE
   -------------------------
   The three apps each carry their own copy of a scheduler, and they
   have already drifted: the two quoting apps' copies are currently
   byte-identical, but the production app's is a different algorithm
   entirely (a stage model over windows rather than a task model).
   A fourth feature written three times is how they drift further.

   So the engine lives here and is loaded by all three. It is a plain
   script with no dependencies and no framework, exactly like the
   rest of this project.

   DETERMINISM
   -----------
   The same input always produces the same plan. No Date.now(), no
   Math.random(), no iteration over a Set whose order depends on
   insertion. A plan that reshuffles itself between renders is worse
   than no plan, because the user cannot trust what they are looking
   at.
   ========================================================= */

"use strict";

(function (global) {
    /* =========================================================
       1. TIME

       A working day is 7 hours, matching what the quoting apps
       already use. It is a single constant because every duration,
       finish date and capacity check derives from it; changing it in
       one place must change the arithmetic everywhere or the figures
       on screen disagree with each other.

       Dates are handled as LOCAL time throughout. Parsing
       "2026-01-08" with new Date() gives midnight UTC, which in
       South Africa (UTC+2) is 02:00 local - and formatting that
       back can land on the 7th. Every date here is constructed from
       its parts instead.
       ========================================================= */

    const WORKING_HOURS_PER_DAY = 7;
    const WORKING_MINUTES_PER_DAY = WORKING_HOURS_PER_DAY * 60;

    function parseLocalDate(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
        if (!match) return null;
        const date = new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3])
        );
        return isNaN(date.getTime()) ? null : date;
    }

    function formatLocalDate(date) {
        if (!date) return "";
        const pad = (n) => String(n).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function isWeekend(date) {
        const day = date.getDay();
        return day === 0 || day === 6;
    }

    /* The next date that is not a Saturday or Sunday. */
    function nextWorkingDay(value) {
        const date = parseLocalDate(value);
        if (!date) return "";
        do {
            date.setDate(date.getDate() + 1);
        } while (isWeekend(date));
        return formatLocalDate(date);
    }

    /* Step forward by N working days from a working day. */
    function addWorkingDays(value, days) {
        const date = parseLocalDate(value);
        if (!date) return "";
        let left = Math.max(0, Number(days) || 0);
        while (left > 0) {
            date.setDate(date.getDate() + 1);
            while (isWeekend(date)) date.setDate(date.getDate() + 1);
            left--;
        }
        return formatLocalDate(date);
    }

    /* Working minutes between two dates, inclusive of both. */
    function workingMinutesBetween(startValue, endValue) {
        const start = parseLocalDate(startValue);
        const end = parseLocalDate(endValue);
        if (!start || !end) return 0;
        const from = start <= end ? start : end;
        const to = start <= end ? end : start;
        let minutes = 0;
        const cursor = new Date(from.getTime());
        let guard = 4000;
        while (cursor <= to && guard > 0) {
            if (!isWeekend(cursor)) minutes += WORKING_MINUTES_PER_DAY;
            cursor.setDate(cursor.getDate() + 1);
            guard--;
        }
        return minutes;
    }

    /* How many working days a duration spans, at least 1. */
    function workingDaysFor(minutes) {
        const total = Math.max(0, Number(minutes) || 0);
        if (!total) return 0;
        return Math.max(1, Math.ceil(total / WORKING_MINUTES_PER_DAY));
    }

    function minutesToHours(minutes) {
        return Math.round((Math.max(0, Number(minutes) || 0) / 60) * 10) / 10;
    }

    /* "2 d 3 h", "5 h 30 m", "45 m" - short form for dense cells. */
    function formatDuration(minutes) {
        const total = Math.max(0, Math.round(Number(minutes) || 0));
        if (!total) return "-";
        const days = Math.floor(total / WORKING_MINUTES_PER_DAY);
        const hours = Math.floor((total % WORKING_MINUTES_PER_DAY) / 60);
        const mins = total % 60;
        const parts = [];
        if (days) parts.push(`${days} d`);
        if (hours) parts.push(`${hours} h`);
        if (mins) parts.push(`${mins} m`);
        return parts.join(" ");
    }

    /* =========================================================
       2. STAFF

       A person on the books.

       capacityMinutes is per DAY and is what makes the whole thing
       work: two people at 7h each are 14h of capacity on one site,
       and an item assigned to both of them finishes in half the
       time of one assigned to either. An item assigned to one of
       them still waits for that person.

       active: a person on leave or a subcontractor who has stopped
       is kept rather than deleted - they appear in a finished plan's
       history, and deleting them would orphan every item they were
       assigned to.
       ========================================================= */

    function normaliseStaff(staff) {
        if (!Array.isArray(staff)) return [];

        return staff
            .map((person, index) => {
                const hours = Number(person && person.hoursPerDay);
                const capacity = Number.isFinite(hours) && hours > 0
                    ? Math.round(hours * 60)
                    : WORKING_MINUTES_PER_DAY;

                return {
                    id: safeId(person && person.id, `staff-${index + 1}`),
                    name: safeText(person && person.name) || `Worker ${index + 1}`,
                    trade: safeText(person && person.trade),
                    phone: safeText(person && person.phone),
                    /* Where this person is based. Not scheduling -
                       it is shown on the multi-site board so a planner
                       can see who is reachable. */
                    homeSiteId: safeText(person && person.homeSiteId),
                    capacityMinutes: capacity,
                    active: person && person.active === false ? false : true,
                    /* A person who cannot work at the same time as
                       themselves still appears in the plan. This is
                       for equipment or a one-person trade, not for
                       holidays. */
                    colour: safeText(person && person.colour)
                };
            })
            .filter((person) => person.name);
    }

    /* =========================================================
       3. SITES

       A place of work. A project may have more than one, and each
       carries its own tasks, so "how do we run three sites at once"
       is answered by planning all three together rather than by
       switching between them.
       ========================================================= */

    function normaliseSites(sites, fallbackName) {
        if (!Array.isArray(sites) || !sites.length) {
            return [
                {
                    id: "site-main",
                    name: safeText(fallbackName) || "Main site",
                    address: "",
                    projectId: "",
                    projectName: safeText(fallbackName) || "",
                    start: ""
                }
            ];
        }

        return sites.map((site, index) => ({
            id: safeId(site && site.id, `site-${index + 1}`),
            name: safeText(site && site.name) || `Site ${index + 1}`,
            address: safeText(site && site.address),
            projectId: safeText(site && site.projectId),
            projectName: safeText(site && site.projectName),
            start: formatDateOnly(site && site.start)
        }));
    }

    /* =========================================================
       4. ITEMS

       A line of work. durationMinutes is the work CONTENT - 210
       minutes of painting. assignees is the list of staff who can
       do it. The two are different on purpose: four people on a job
       do not do four times the work, they do the same work in a
       quarter of the time. So duration is divided between the
       assignees, not multiplied by them.
       ========================================================= */

    function normaliseItem(item, index) {
        const duration = Number(item && item.durationMinutes);

        return {
            id: safeId(item && item.id, `item-${index + 1}`),
            siteId: safeText(item && item.siteId),
            task: safeText(item && item.task) || "Untitled task",
            quantity: Math.max(1, Number(item && item.quantity) || 1),
            durationMinutes: Number.isFinite(duration) && duration > 0
                ? Math.round(duration)
                : 0,
            assignees: Array.isArray(item && item.assignees)
                ? item.assignees.map(safeText).filter(Boolean)
                : [],
            /* A pinned start is a fixture: the crew is on site that
               day whatever the maths says. The old scheduler honoured
               these; dropping them would silently un-anchor a plan
               someone set up by hand. */
            start: formatDateOnly(item && item.start),
            startPinned: Boolean(item && item.startPinned),
            priority: Number(item && item.priority) || index,
            /* Carried through so a site board can group and label. */
            category: safeText(item && item.category),
            quoteId: safeText(item && item.quoteId),
            trade: safeText(item && item.trade)
        };
    }

    /* =========================================================
       5. THE SCHEDULER

       Greedy list scheduling, which is the right shape for this:
       work is ordered (priority, then the order the site listed it),
       and each item takes the earliest slot where every one of its
       assignees has room in that day.

       Why greedy and not optimal: an optimal solver (topological
       sort against a full resource model) would need a solver, would
       be slower on a large plan, and would produce a plan that
       jumps around as quantities change - the user changes one
       window's size and everything reorders. A greedy plan is
       explainable: each item is as early as it can be, given what
       came before.

       THE CORE LOOP
       -------------
       For each item, in order:

         - how many minutes of WALL time does it need, given who is
           on it? An item with 3 people and 210 minutes of work is
           70 minutes of the day, because all three work at once.
           An item with 1 person is the full 210.
         - find the earliest working day on which every assignee has
           `perDay` free. A day is rejected if any one of them is
           already over.
         - commit: book that much of each assignee's capacity on
           that day, and record the span.

       OVERLOAD IS ALLOWED BUT REPORTED, NOT BLOCKED. If an item's
       assignees are all booked out, the scheduler still places it -
       on the next day with room - and if the whole horizon is full
       it places it anyway and flags the day as overbooked. A plan
       that refuses to schedule work is worse than a plan that shows
       a red day.
       ========================================================= */

    /* Minutes of wall-clock the day needs, given the assignees. */
    function wallMinutesFor(item, staffCount) {
        if (!item.durationMinutes) return 0;
        /* No assignee means unassigned work: it still takes time, it
           just has nobody's capacity to draw on, so it is measured
           as one person. */
        return Math.max(
            1,
            Math.ceil(item.durationMinutes / Math.max(1, staffCount))
        );
    }

    /*
       Per-staff, per-day booked minutes.

       A Map keyed "staffId|2026-01-08" holding minutes. Insertion
       order is never iterated for scheduling decisions - only lookups
       - so the plan cannot depend on it. That is what keeps the
       output deterministic.
    */
    function createLedger(staff) {
        return {
            staff,
            booked: new Map(),
            key(staffId, date) {
                return `${staffId}|${date}`;
            },
            get(staffId, date) {
                return this.booked.get(this.key(staffId, date)) || 0;
            },
            add(staffId, date, minutes) {
                const key = this.key(staffId, date);
                this.booked.set(key, (this.booked.get(key) || 0) + minutes);
            },
            capacityOf(staffId) {
                const person = staff.find((s) => s.id === staffId);
                return person ? person.capacityMinutes : WORKING_MINUTES_PER_DAY;
            }
        };
    }

    /*
       The minutes of a working day available to a group.

       For several people on one item the wall-clock day is still one
       day - they work alongside each other, not in shifts - so this is
       the capacity of the busiest person in the group, not the sum.
       Using the sum would let a group of four work eight hours each
       because together they could cover two days.
    */
    function workingCapacityOn(ledger, assignees) {
        if (!assignees.length) {
            return WORKING_MINUTES_PER_DAY;
        }

        return assignees.reduce((smallest, staffId) => {
            const capacity = ledger.capacityOf(staffId);
            return capacity > 0 && capacity < smallest ? capacity : smallest;
        }, WORKING_MINUTES_PER_DAY);
    }

    /*
       Working days a duration spans FOR A GIVEN DAILY CAPACITY.

       The plain workingDaysFor() divides by the standard 7-hour day,
       which is wrong for anyone who does not work a full day: 300
       minutes is one standard day, but two days for a worker with a
       3.5-hour day. Spanning was computed against the wrong divisor,
       so a part-day worker was shown finishing on a day they are not
       there for.
    */
    function daysForPeople(minutes, dailyCapacity) {
        const perDay = Number(dailyCapacity) > 0
            ? Number(dailyCapacity)
            : WORKING_MINUTES_PER_DAY;
        return Math.max(1, Math.ceil(Math.max(0, Number(minutes) || 0) / perDay));
    }

    /*
       The earliest working day, at or after `from`, on which every
       assignee has `wallMinutes` free.

       A member who is not in the roster is treated as having no
       capacity constraint at all rather than as full: an item naming
       someone who has since been removed should still schedule, and
       the missing person is reported separately. Treating them as
       full would deadlock the item off the end of the plan.

       A JOB BIGGER THAN ONE DAY IS THE OTHER HALF OF THAT RULE.

       If wallMinutes exceeds a single day's capacity it will never fit
       on any day, and the loop below would skip forward a day at a
       time for the whole horizon - a 300-minute job against a
       210-minute day landed in January of the following year. So
       such a job starts on the first day it can and spans from there;
       the overrun is reported by collectWarnings as an overbooked
       day. A plan that shows an impossible job as impossible is
       useful; a plan that hides it two years out is not.
    */
    function findSlot(ledger, assignees, wallMinutes, from, horizonDays) {
        let day = formatDateOnly(from);

        if (!day) return "";

        /* An item already past its anchor must not be dragged
           backwards, so the search starts there. */
        const limit = Math.max(1, Number(horizonDays) || 1);

        /* Bigger than any of their days: nothing will ever fit it. */
        const tooBigForOneDay =
            ledger.capacityOf(assignees[0]) > 0 &&
            wallMinutes > ledger.capacityOf(assignees[0]);

        for (let step = 0; step < limit; step++) {
            if (isWeekend(parseLocalDate(day))) {
                day = nextWorkingDay(day);
                continue;
            }

            /* Oversized work goes on the first working day available. */
            if (tooBigForOneDay) return day;

            const fits = assignees.every((staffId) => {
                const person = ledger.staff.find((s) => s.id === staffId);
                /* Unknown person: no constraint. */
                if (!person) return true;
                /* Inactive: treated as absent, same as unknown, so
                   their items move to someone who can actually do
                   them. */
                if (!person.active) return true;
                return ledger.get(staffId, day) + wallMinutes <= person.capacityMinutes;
            });

            if (fits) return day;

            day = nextWorkingDay(day);
        }

        /* Nothing free inside the horizon: the last day tried, which
           is where the overload is reported. */
        return day;
    }

    /**
     * Build a plan.
     *
     * @param {object[]} items    Raw items; normalised inside.
     * @param {object}   options
     *   - staff       Raw staff list.
     *   - startDate   The earliest any work may begin (ISO date).
     *   - horizonDays How far ahead to look for a free day.
     * @returns {{assignments, ledger, staff, warnings, span}}
     */
    function buildPlan(items, options) {
        const settings = options || {};
        const staff = normaliseStaff(settings.staff);
        const normalised = (Array.isArray(items) ? items : [])
            .map(normaliseItem)
            .filter((item) => item.durationMinutes > 0);

        /*
           Order: pinned starts first, then priority, then the order
           the site listed them.

           Pinned first because a pinned start is a promise about the
           real world - the crew is there that day - and everything
           else should be scheduled around it, not the other way
           round.
        */
        normalised.sort((a, b) => {
            if (a.startPinned !== b.startPinned) return a.startPinned ? -1 : 1;
            if (a.priority !== b.priority) return a.priority - b.priority;
            return 0;
        });

        const ledger = createLedger(staff);

        const startDate = formatDateOnly(settings.startDate) || formatLocalDate(new Date());
        const horizonDays = Math.max(
            1,
            Number(settings.horizonDays) || 260
        );

        const assignments = normalised.map((item) => {
            /*
               Only staff who exist and are active constrain the
               schedule. The full assignee list is kept on the record
               so the UI can show who was named, but booking is done
               against the schedulable subset - otherwise an item
               assigned to one active person and one who has left can
               never find a slot.
            */
            const schedulable = item.assignees.filter((staffId) => {
                const person = staff.find((s) => s.id === staffId);
                return person && person.active;
            });

            const unknownAssignees = item.assignees.filter((staffId) => {
                const person = staff.find((s) => s.id === staffId);
                return !person;
            });

            /*
               Someone who exists but is not active. Reported, because
               their name is still on the item and the planner needs to
               see that the work is effectively being done by fewer
               people than the item says - which changes its duration.
            */
            const inactiveAssignees = item.assignees.filter((staffId) => {
                const person = staff.find((s) => s.id === staffId);
                return person && !person.active;
            });

            const wallMinutes = wallMinutesFor(item, schedulable.length);
            const effectiveMinutes = wallMinutes * Math.max(1, item.quantity);

            const anchor = item.startPinned && item.start
                ? item.start
                : startDate;

            const slot = findSlot(
                ledger,
                schedulable,
                effectiveMinutes,
                anchor,
                horizonDays
            );

            /*
               THE BOOKING IS SPREAD ACROSS THE DAYS A JOB OCCUPIES.

               This used to book a job's entire wall time against the day
               it STARTED, which quietly over-books someone the moment a
               job runs longer than a day: a two-day job used both
               people's whole first day and none of the second, so two
               two-day jobs stacked on the same days looked fine and were
               not.

               Instead each person is booked the share they actually
               work on each day of the span, so capacity is released as
               the job rolls on and the strip reads truthfully.
            */
            const days = daysForPeople(
                effectiveMinutes,
                workingCapacityOn(ledger, schedulable)
            );

            if (slot) {
                let remaining = effectiveMinutes;
                let cursorDay = slot;

                for (let d = 0; d < days; d++) {
                    /* What is worked on this particular day: a full
                       day of work, or whatever is left of the job. */
                    const todayMinutes = Math.min(
                        remaining,
                        workingCapacityOn(ledger, schedulable)
                    );

                    if (todayMinutes > 0) {
                        schedulable.forEach((staffId) => {
                            ledger.add(staffId, cursorDay, todayMinutes);
                        });
                        remaining -= todayMinutes;
                    }

                    if (d < days - 1) {
                        cursorDay = nextWorkingDay(cursorDay);
                    }
                }
            }

            return {
                ...item,
                schedulable,
                unknownAssignees,
                inactiveAssignees,
                wallMinutes: effectiveMinutes,
                start: slot,
                finish: slot ? addWorkingDays(slot, Math.max(0, days - 1)) : "",
                days,
                /* True when the item is longer than a day, so the UI
                   can avoid drawing it as a single-day bar. */
                multiDay: days > 1,
                assigned: schedulable.length > 0
            };
        });

        return {
            assignments,
            ledger,
            staff,
            warnings: collectWarnings(assignments, ledger, staff),
            span: planSpan(assignments)
        };
    }

    /*
       Everything the planner needs to be told, collected in one pass
       so the UI does not have to re-derive it.

       These are the things that are true of a real plan and are easy
       to miss: unassigned work, work assigned to nobody who exists,
       and days where someone is booked past their capacity.
    */
    function collectWarnings(assignments, ledger, staff) {
        const warnings = [];

        assignments.forEach((item) => {
            if (item.unknownAssignees.length) {
                warnings.push({
                    type: "unknown-assignee",
                    itemId: item.id,
                    message: `"${item.task}" is assigned to someone not on the roster: ${item.unknownAssignees.join(", ")}`
                });
            }

            if (item.inactiveAssignees && item.inactiveAssignees.length) {
                warnings.push({
                    type: "inactive-assignee",
                    itemId: item.id,
                    message: `"${item.task}" is assigned to ${item.inactiveAssignees.join(", ")}, who cannot currently work - scheduled with the remaining ${item.schedulable.length} of ${item.assignees.length}`
                });
            }

            if (!item.schedulable.length) {
                warnings.push({
                    type: "unassigned",
                    itemId: item.id,
                    message: `"${item.task}" has nobody to do it`
                });
            }
        });

        /*
           Overbooked days. Walk every booked key and compare against
           the person's capacity. The keys are only read, never
           iterated for a decision, so this cannot affect the plan -
           it is a report on the plan.
        */
        ledger.booked.forEach((minutes, key) => {
            const [staffId, date] = key.split("|");
            const person = staff.find((s) => s.id === staffId);
            if (!person) return;
            if (minutes <= person.capacityMinutes) return;

            warnings.push({
                type: "overbooked",
                staffId,
                date,
                message: `${person.name} is booked ${minutesToHours(minutes)}h on ${date} against a ${minutesToHours(person.capacityMinutes)}h day`
            });
        });

        return warnings;
    }

    function planSpan(assignments) {
        if (!assignments.length) {
            return { start: "", finish: "", days: 0, itemCount: 0 };
        }

        const starts = assignments.map((a) => a.start).filter(Boolean).sort();
        const finishes = assignments.map((a) => a.finish).filter(Boolean).sort();

        const start = starts[0] || "";
        const finish = finishes[finishes.length - 1] || "";

        return {
            start,
            finish,
            days: start && finish
                ? Math.max(
                    1,
                    Math.ceil(
                        workingMinutesBetween(start, finish) /
                        WORKING_MINUTES_PER_DAY
                    )
                )
                : 0,
            itemCount: assignments.length
        };
    }

    /* =========================================================
       6. THE MULTI-SITE BOARD

       The view the old scheduler had no way to produce: every site
       at once, with what is happening on each and who is on it.

       Built from the plan rather than re-deriving anything, so the
       board and the schedule can never disagree - they are the same
       calculation read two ways.
       ========================================================= */

    function buildSiteBoard(plan, sites) {
        const siteList = normaliseSites(sites);

        const rows = siteList.map((site) => {
            const items = plan.assignments.filter(
                (item) => !item.siteId || item.siteId === site.id
            );

            const siteStaff = new Set();
            items.forEach((item) => {
                item.schedulable.forEach((staffId) => siteStaff.add(staffId));
            });

            const totalMinutes = items.reduce(
                (sum, item) => sum + item.wallMinutes,
                0
            );

            const starts = items.map((i) => i.start).filter(Boolean).sort();
            const finishes = items.map((i) => i.finish).filter(Boolean).sort();

            return {
                site,
                itemCount: items.length,
                totalMinutes,
                totalHours: minutesToHours(totalMinutes),
                staffIds: [...siteStaff].sort(),
                start: starts[0] || "",
                finish: finishes[finishes.length - 1] || "",
                /* Items that could not be given anybody. */
                unassigned: items.filter((i) => !i.assigned).length,
                items
            };
        });

        /* Anyone with no work at all, so a planner can see spare
           capacity without checking every site. */
        const assignedStaff = new Set();
        rows.forEach((row) => row.staffIds.forEach((id) => assignedStaff.add(id)));

        const idle = plan.staff.filter(
            (person) => person.active && !assignedStaff.has(person.id)
        );

        return {
            rows,
            idle,
            span: plan.span,
            warnings: plan.warnings
        };
    }

    /*
       Per-person day-by-day load, for the capacity strip.

       Returned as a sorted list of {date, minutes, capacity,
       overbooked} so the UI can render a row per person and a column
       per day without doing any arithmetic of its own.
    */
    function capacityByPerson(plan, fromDate, dayCount) {
        const days = Math.max(1, Number(dayCount) || 10);
        const dates = [];

        /*
           The FIRST date is `fromDate` itself.

           This used to start at nextWorkingDay(fromDate), which made
           the strip read as a day later than the plan: a full day of
           work booked on the Monday showed 0h against Monday and the
           420 against Tuesday. The strip has to report the days the
           plan is actually in.
        */
        let cursor = formatDateOnly(fromDate) || plan.span.start;

        if (cursor) {
            dates.push(cursor);
        }

        for (let i = 1; i < days; i++) {
            const date = nextWorkingDay(cursor);
            if (!date) break;
            cursor = date;
            dates.push(date);
        }

        return plan.staff.map((person) => ({
            staff: person,
            days: dates.map((date) => {
                const minutes = plan.ledger.get(person.id, date);
                return {
                    date,
                    minutes,
                    hours: minutesToHours(minutes),
                    capacityMinutes: person.capacityMinutes,
                    capacityHours: minutesToHours(person.capacityMinutes),
                    overbooked: minutes > person.capacityMinutes,
                    free: Math.max(0, person.capacityMinutes - minutes)
                };
            })
        }));
    }

    /* =========================================================
       7. THE CALENDAR VIEW

       A month or a fortnight of days, each carrying what is on it.

       Built from the plan, so the calendar cannot disagree with the
       schedule - a day shows a job on it only because the scheduler
       put it there. It answers the question a table cannot: "what is
       happening on the 14th?".

       WEEKENDS ARE INCLUDED, deliberately. A calendar that hides
       Saturday and Sunday looks like a calendar where the job
       finishes on Friday when it actually rolls into Monday, and
       the gap between the last working day and the next is exactly
       the thing a planner needs to see. They are flagged instead.
       ========================================================= */

    function monthGrid(year, month) {
        /* month is 1-12, as a human thinks of it. */
        const y = Number(year);
        const m = Number(month);
        const first = new Date(y, m - 1, 1);
        const daysInMonth = new Date(y, m, 0).getDate();

        /* Monday-first: the week starts on the 1st in this app's
           date maths, so a Monday-first grid aligns with it. */
        const lead = (first.getDay() + 6) % 7;

        const cells = [];

        for (let i = 0; i < lead; i++) {
            cells.push({ date: "", inMonth: false, weekend: false });
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = formatLocalDate(new Date(y, m - 1, day));
            const parsed = parseLocalDate(date);
            cells.push({
                date,
                day,
                inMonth: true,
                weekend: isWeekend(parsed),
                isToday: date === formatLocalDate(new Date())
            });
        }

        /* Pad to whole weeks so the grid does not end ragged. */
        while (cells.length % 7 !== 0) {
            cells.push({ date: "", inMonth: false, weekend: false });
        }

        return cells;
    }

    /*
       The calendar for a plan: days carrying their items.

       Every working day from the plan's start is included, even a day
       with nothing on, because an empty working day in the middle of
       a job is information - it is spare capacity, or a day somebody
       needs to move work onto.
    */
    function buildCalendar(plan, options) {
        const settings = options || {};
        const dayCount = Math.max(1, Number(settings.dayCount) || 31);
        const startDate =
            formatDateOnly(settings.startDate) || plan.span.start;

        if (!startDate) {
            return { days: [], byDate: new Map(), span: plan.span };
        }

        const days = [];
        const byDate = new Map();
        let cursor = startDate;

        for (let i = 0; i < dayCount; i++) {
            const parsed = parseLocalDate(cursor);
            const date = cursor;

            /* What starts on this day, and what is still running. */
            const starting = plan.assignments.filter(
                (a) => a.start === date
            );
            const running = plan.assignments.filter(
                (a) =>
                    a.start &&
                    a.finish &&
                    a.start <= date &&
                    date <= a.finish
            );

            /* Who is on site that day, and how full each one is. */
            const crew = plan.staff
                .map((person) => {
                    const minutes = plan.ledger.get(person.id, date);
                    return {
                        staff: person,
                        minutes,
                        hours: minutesToHours(minutes),
                        capacityMinutes: person.capacityMinutes,
                        overbooked: minutes > person.capacityMinutes
                    };
                })
                .filter((entry) => entry.minutes > 0);

            const weekend = isWeekend(parsed);

            const day = {
                date,
                weekend,
                isToday: date === formatLocalDate(new Date()),
                starting,
                running,
                crew,
                /* Total booked against the plan on this day. */
                bookedMinutes: crew.reduce((sum, e) => sum + e.minutes, 0),
                itemCount: running.length
            };

            days.push(day);
            byDate.set(date, day);

            cursor = addWorkingDays(cursor, 1);
            if (!cursor) break;
        }

        return { days, byDate, span: plan.span };
    }

    /* =========================================================
       8. THE PROJECT TIMELINE

       A Gantt: one row per item, a bar from its start to its finish,
       against a date axis.

       This is the third read of the same plan - the board, the
       calendar and the timeline are three views of one calculation,
       so they cannot drift apart.

       It answers the question the other two cannot: not "what is on
       the 14th" or "who is on which site", but "how does this job
       run from end to end, and what runs alongside what".

       BARS ARE POSITIONED IN WORKING DAYS, not calendar days, so a
       job that skips a weekend does not appear to have a gap in it.
       A job running Monday to Wednesday is three working days and
       draws as three columns, even though it spans five calendar
       days.
       ========================================================= */

    function buildTimeline(plan, options) {
        const settings = options || {};
        const siteFilter = safeText(settings.siteId);

        const items = siteFilter
            ? plan.assignments.filter(
                (item) => !item.siteId || item.siteId === siteFilter
            )
            : plan.assignments;

        const scheduled = items.filter((item) => item.start);

        /*
           The axis ends at the LAST FINISH THAT EXISTS.

           This used to seed the reduction with scheduled[0].finish,
           which is "" for an item that never got a date - and every
           comparison against "" is true, so a single undated item
           pushed the axis out by 800 guard steps, nearly three years.
           Seeding with the first item's start avoids the empty-string
           case entirely, and an item with no finish is skipped.
        */
        const axisStart = scheduled.length
            ? scheduled.reduce(
                (earliest, item) =>
                    !earliest || item.start < earliest
                        ? item.start
                        : earliest,
                scheduled[0].start
            )
            : "";

        const axisEnd = scheduled.length
            ? scheduled.reduce(
                (latest, item) =>
                    item.finish && (!latest || item.finish > latest)
                        ? item.finish
                        : latest,
                ""
            )
            : "";

        /*
           The column axis: the working days from the start to the end.

           Bounded by axisEnd, not just by the guard. Without it the
           loop runs to the 800-iteration guard and produced a three
           year axis for a one-day job - a timeline wide enough to
           scroll through for a fortnight of work.
        */
        const columns = [];
        let cursor = axisStart;
        let guard = 0;
        while (cursor && guard < 800) {
            columns.push(cursor);
            if (axisEnd && cursor >= axisEnd) break;
            cursor = addWorkingDays(cursor, 1);
            guard++;
        }

        /*
           The offset of a date in working days from the axis start.

           This is what makes a weekend invisible: Monday is column 0,
           Tuesday 1, and the following Monday is column 5, so a
           three-day job draws three columns wide rather than seven.
        */
        const columnIndex = (date) => columns.indexOf(date);

        const rows = scheduled.map((item) => {
            const from = columnIndex(item.start);
            const to = columnIndex(item.finish);

            return {
                item,
                task: item.task,
                siteId: item.siteId,
                assignees: item.schedulable,
                assigneesLabel: item.schedulable
                    .map((id) => {
                        const person = plan.staff.find((s) => s.id === id);
                        return person ? person.name : id;
                    })
                    .join(", "),
                start: item.start,
                finish: item.finish,
                /* -1 means "not on this axis", which happens when a
                   pinned item sits outside the window. The row still
                   renders, with its dates in the label. */
                fromColumn: from,
                toColumn: to,
                spanColumns: to >= from ? to - from + 1 : 0,
                days: item.days,
                hours: minutesToHours(item.wallMinutes),
                assigned: item.assigned,
                /* Grouping key for the optional site/assignee rows. */
                trade: item.trade
            };
        });

        return {
            rows,
            columns,
            axisStart,
            axisEnd,
            /* Grouped by site, so the rows read as places of work
               rather than as an undifferentiated list. */
            groups: groupTimelineRows(rows, columns),
            span: plan.span
        };
    }

    function groupTimelineRows(rows, columns) {
        const groups = [];
        const seen = new Map();

        rows.forEach((row) => {
            const key = row.siteId || "";

            if (!seen.has(key)) {
                const group = {
                    siteId: key,
                    label: key || "Unassigned to a site",
                    rows: [],
                    /* The span of the GROUP, which is not the span of
                       its longest row: two rows a week apart give the
                       group a week of occupancy even though neither
                       row is that long. */
                    fromColumn: -1,
                    toColumn: -1
                };
                seen.set(key, group);
                groups.push(group);
            }

            const group = seen.get(key);
            group.rows.push(row);

            if (row.fromColumn >= 0) {
                group.fromColumn =
                    group.fromColumn < 0
                        ? row.fromColumn
                        : Math.min(group.fromColumn, row.fromColumn);
                group.toColumn = Math.max(group.toColumn, row.toColumn);
            }
        });

        /* A group's summary bar spans its rows, plus a working day
           either side so the ends are visible. */
        groups.forEach((group) => {
            group.spanColumns =
                group.toColumn >= group.fromColumn
                    ? group.toColumn - group.fromColumn + 1
                    : 0;
            group.start =
                group.fromColumn >= 0 ? columns[group.fromColumn] || "" : "";
            group.finish =
                group.toColumn >= 0 ? columns[group.toColumn] || "" : "";
        });

        return groups;
    }

    /*
       The project-level timeline: every site as one row, so a
       multi-site contract can be read as "these run at once" rather
       than as three separate plans the reader has to hold in their
       head.
    */
    function buildProjectTimeline(plan, sites) {
        const siteList = normaliseSites(sites);

        const board = buildSiteBoard(plan, siteList);

        return {
            sites: board.rows,
            idle: board.idle,
            span: plan.span,
            warnings: plan.warnings
        };
    }

    /* =========================================================
       9. SMALL HELPERS

       Local rather than imported: this file is loaded as a plain
       script by three apps that each have their own escapeHtml, and
       importing the trade apps' helpers here would couple the
       engine to whichever app happens to load first.
       ========================================================= */

    function safeText(value) {
        if (value === null || value === undefined) return "";
        return String(value);
    }

    function safeId(value, fallback) {
        const text = safeText(value).trim();
        return text || fallback;
    }

    function formatDateOnly(value) {
        const parsed = parseLocalDate(value);
        return parsed ? formatLocalDate(parsed) : "";
    }

    const api = {
        WORKING_HOURS_PER_DAY,
        WORKING_MINUTES_PER_DAY,
        parseLocalDate,
        formatLocalDate,
        formatDateOnly,
        isWeekend,
        nextWorkingDay,
        addWorkingDays,
        workingMinutesBetween,
        workingDaysFor,
        daysForPeople,
        minutesToHours,
        formatDuration,
        normaliseStaff,
        normaliseSites,
        normaliseItem,
        buildPlan,
        buildSiteBoard,
        buildProjectTimeline,
        buildCalendar,
        buildTimeline,
        monthGrid,
        capacityByPerson,
        planSpan,
        collectWarnings,
        wallMinutesFor
    };

    global.PlanningCore = api;

    /* Also exported for the test runner, which loads the file and
       reads the module directly rather than through a browser. */
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})(typeof window !== "undefined" ? window : globalThis);

/* =========================================================
   SHARED PLANNING FOR THE QUOTING APPS
   ---------------------------------------------------------
   One file, loaded by both the plumbing (APS) and coatings (APC)
   apps, so the two cannot drift apart.

   WHY A SEPARATE FILE
   -------------------
   The two quoting apps are copies of one another, and every feature
   written into both of them has been written twice and then watched
   drift. Their planning screens were identical when this started, and
   the identical parts have already had one bug fixed in one app and
   missed in the other more than once.

   So: the shared planning logic lives here, and each app supplies
   only its own storage key, labels and element ids.

   WHAT IT ADDS
   ------------
   The apps already had projects, tasks, an owner field and a
   timeline. What they could NOT do:

     - run two tasks at once. autoScheduleItems() walked ONE cursor
       through ONE project's tasks in order, so concurrency was
       impossible by construction;
     - know who the owner is. `owner` was free text typed into a row,
       so there was no capacity to book against and no way to tell a
       person who is double-booked from two people with similar names;
     - run several sites at once. There was one project open at a time;
     - show a calendar.

   All four come from PlanningCore. This file is the bridge: it turns
   each app's projects and tasks into core items, runs the plan, and
   renders the multi-site board, the capacity strip and the calendar.
   ========================================================= */

"use strict";

(function (global) {
    /* =========================================================
       1. THE ROSTER

       Real people, each with a daily capacity.

       Seeded from the app's existing `owner` text, so a plan that was
       already partly written - three tasks with "Pieter" on them -
       becomes a real roster the moment it is opened, instead of the
       owner names having to be retyped.

       An unknown owner is still kept: work assigned to someone who
       is not on the roster is scheduled and REPORTED, because silently
       dropping it is how a job arrives on site with nobody booked.
       ========================================================= */

    const STAFF_KEY = "planning-staff";

    function readJson(key, fallback) {
        try {
            const raw = global.localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (error) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            global.localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            /* Private mode. The roster simply will not persist. */
        }
    }

    /*
       The name on a task, normalised for matching.

       "Pieter ", "pieter" and "P. van der Berg" are three spellings of
       one person as far as a planner is concerned, and a case
       difference must never split them into two people with two sets
       of capacity.
    */
    function normaliseName(name) {
        return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
    }

    /*
       Build a roster from whatever the app already knows.

       Every distinct owner across every task becomes a person with a
       full day of capacity. Existing roster entries win, so a capacity
       a manager has set is not reset by opening the app.
    */
    function rosterFromProjects(projects, existing) {
        const people = Array.isArray(existing) ? existing.slice() : [];
        const seen = new Set(people.map(person => normaliseName(person.name)));

        (projects || []).forEach(project => {
            (project.items || []).forEach(item => {
                const name = String(item.owner || "").trim();
                const key = normaliseName(name);

                if (!name || seen.has(key)) {
                    return;
                }

                seen.add(key);
                people.push({
                    id: `owner-${key.replace(/[^a-z0-9]+/gi, "-")}`,
                    name,
                    trade: String(item.category || "").trim(),
                    hoursPerDay: 8,
                    active: true
                });
            });
        });

        return people;
    }

    function getRoster(config) {
        const stored = readJson(STAFF_KEY, null);
        const projects = config.getProjects();
        const roster = rosterFromProjects(projects, Array.isArray(stored) ? stored : []);

        /* Persist so a name seen once is remembered as a person even
           after its task is deleted. */
        if (!Array.isArray(stored) || stored.length !== roster.length) {
            writeJson(STAFF_KEY, roster);
        }

        return roster;
    }

    /*
       The roster is per APP, not per company: the plumbing trade and
       the coatings trade have different people, and they already keep
       separate localStorage. So this takes no config - the caller's
       storage scope is the scope.
    */
    function setRoster(roster) {
        writeJson(STAFF_KEY, roster);
        return roster;
    }

    /* =========================================================
       2. TASKS INTO CORE ITEMS

       The app's task shape is kept intact - this does not migrate
       storage, only reads it. A task becomes a core item with:

         durationMinutes  the task's own minutes
         assignees        the roster id for its owner
         start            only when the user PINNED one
         siteId           the project it belongs to

       THE PIN IS THE IMPORTANT PART.

       A task the manager typed a date onto is a promise: the crew is
       there that day. It is passed through as a pin so the core lays
       everything else out around it. A start date the scheduler
       itself wrote on a previous run is a RESULT, not a promise, so
       it is deliberately not passed - otherwise every task would
       re-anchor to its own last calculated date and the chain would
       quietly break on each rebuild.
       ========================================================= */

    function itemsForCore(config, project, roster, plans) {
        const items = (project.items || []).map((item, index) => {
            const owner = normaliseName(item.owner);
            const person = roster.find(p => normaliseName(p.name) === owner);

            return {
                id: `${project.id}-item-${index}`,
                task: String(item.task || "Untitled task"),
                category: String(item.category || ""),
                durationMinutes: config.taskMinutes(item),
                assignees: person ? [person.id] : [],
                start: item.startPinned ? item.start : "",
                startPinned: Boolean(item.startPinned && item.start),
                priority: index,
                siteId: project.id
            };
        });

        void plans;
        return items;
    }

    /*
       Several sites at once.

       One site per project. That is the honest mapping: each project
       in these apps is a job at a place, and the old screen could
       only open one at a time. The board shows them together, which
       is the question - "we have three sites running, who is where" -
       the old screen could not answer.
    */
    function sitesForCore(projects) {
        return (projects || []).map(project => ({
            id: project.id,
            name: project.name || project.id || "Untitled project",
            address: project.customer || "",
            projectId: project.id,
            projectName: project.name || "",
            start: project.start || ""
        }));
    }

    /* =========================================================
       3. THE PLAN

       Every project is planned in ONE call, not one at a time.

       That is the whole point: a per-project plan cannot see the
       others, so two projects sharing a person would each be told
       they have that person free on the same day.
       ========================================================= */

    function buildAllProjectsPlan(config) {
        if (typeof global.PlanningCore === "undefined") {
            return null;
        }

        const projects = config.getProjects();
        const roster = getRoster(config);

        const items = [];
        projects.forEach(project => {
            items.push(...itemsForCore(config, project, roster, null));
        });

        const startDate = config.anchorDate();

        return global.PlanningCore.buildPlan(items, {
            staff: roster,
            startDate
        });
    }

    /*
       Put the calculated dates back onto the app's own tasks.

       Only the START is written, and only when the task is not
       pinned. The finish is left alone: the app computes its own from
       the start, and writing both would let the two disagree.

       Returns the projects that actually changed, so the caller can
       tell whether a save is needed.
    */
    function applyPlanToProjects(config, plan) {
        const projects = config.getProjects();
        const byId = new Map();

        plan.assignments.forEach(assignment => {
            byId.set(assignment.id, assignment);
        });

        let changed = false;

        projects.forEach(project => {
            (project.items || []).forEach((item, index) => {
                const assignment = byId.get(`${project.id}-item-${index}`);
                if (!assignment || !assignment.start) {
                    return;
                }

                if (!item.startPinned && item.start !== assignment.start) {
                    item.start = assignment.start;
                    changed = true;
                }
            });
        });

        if (changed) {
            config.saveProjects();
        }

        return changed;
    }

    /* =========================================================
       4. THE MULTI-SITE BOARD

       Replaces "one project open at a time" with every project at
       once: what is on each site, when it runs, and who is on it.

       The idle column is as important as the rest. A planner with
       three sites running is trying to answer "who can I send
       somewhere else today", and that needs spare capacity shown,
       not inferred.
       ========================================================= */

    function renderSiteBoard(config, plan, container) {
        if (!container) {
            return;
        }

        const projects = config.getProjects();

        if (!projects.length) {
            container.innerHTML = `
                <div class="material-empty">
                    No projects yet. Create one to plan the work.
                </div>
            `;
            return;
        }

        if (!plan || !plan.assignments.length) {
            container.innerHTML = `
                <div class="material-empty">
                    Add dates to your tasks, or press Auto-plan, to see every
                    site at once.
                </div>
            `;
            return;
        }

        const board = global.PlanningCore.buildSiteBoard(
            plan,
            sitesForCore(projects)
        );

        const byProject = board.rows.map(row => ({
            id: row.site.id,
            itemCount: row.itemCount
        }));
        void byProject;

        container.innerHTML = `
            <table class="site-board">
                <thead>
                    <tr>
                        <th>Site</th>
                        <th>Customer</th>
                        <th>Runs</th>
                        <th>Tasks</th>
                        <th>Work</th>
                        <th>Crew</th>
                        <th>Open</th>
                    </tr>
                </thead>
                <tbody>
                    ${board.rows.map(row => {
            const project = projects.find(p => p.id === row.site.id) || {};
            const crew = row.staffIds
                .map(id => (plan.staff.find(p => p.id === id) || {}).name)
                .filter(Boolean);

            return `
                            <tr${row.unassigned ? ' class="has-unassigned"' : ''}>
                                <td>
                                    <strong>${escapeHtml(row.site.name)}</strong>
                                    ${row.site.address
                    ? `<small>${escapeHtml(row.site.address)}</small>`
                    : ""}
                                </td>
                                <td>${escapeHtml(project.customer || "-")}</td>
                                <td class="site-board-dates">
                                    ${row.start
                    ? `${escapeHtml(config.shortDate(row.start))} &rarr; ${escapeHtml(config.shortDate(row.finish))}`
                    : "-"}
                                </td>
                                <td class="site-board-number">${row.itemCount}</td>
                                <td class="site-board-number">${escapeHtml(row.totalHours)}h</td>
                                <td>${crew.length
                    ? escapeHtml(crew.join(", "))
                    : '<span class="site-board-none">Nobody booked</span>'}</td>
                                <td class="site-board-number">${config.projectActions(project)}</td>
                            </tr>
                        `;
        }).join("")}
                </tbody>
            </table>

            ${board.idle.length
                ? `<p class="site-board-idle">
                       <strong>Free this period:</strong>
                       ${escapeHtml(board.idle.map(p => p.name).join(", "))}
                   </p>`
                : ""}
        `;
    }

    /* =========================================================
       5. THE CAPACITY STRIP

       One row per person, one column per working day, showing how
       full each day is.

       This is the answer to "can two of these be done at once". Two
       people on two different rows both showing a full bar on the
       same column means two jobs are running that day; one person
       showing two bars cannot happen, because the scheduler will not
       book them twice.
       ========================================================= */

    function renderCapacityStrip(config, plan, container, dayCount) {
        if (!container) {
            return;
        }

        if (!plan || !plan.assignments.length) {
            container.innerHTML = `<div class="material-empty">Nothing scheduled to show yet.</div>`;
            return;
        }

        const capacity = global.PlanningCore.capacityByPerson(
            plan,
            config.anchorDate(),
            dayCount || 10
        );

        if (!capacity.length) {
            container.innerHTML = `
                <div class="material-empty">
                    No people to schedule. Give a task an owner and the roster
                    builds itself from the names.
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="capacity-strip">
                <thead>
                    <tr>
                        <th>Person</th>
                        ${capacity[0].days.map(day => `
                            <th title="${escapeHtml(day.date)}">
                                ${escapeHtml(config.shortDate(day.date))}
                            </th>
                        `).join("")}
                    </tr>
                </thead>
                <tbody>
                    ${capacity.map(row => `
                        <tr>
                            <th scope="row">${escapeHtml(row.staff.name)}</th>
                            ${row.days.map(day => {
            const pct = day.capacityMinutes
                ? Math.min(100, Math.round((day.minutes / day.capacityMinutes) * 100))
                : 0;
            return `
                                    <td class="capacity-cell${day.overbooked ? " is-over" : ""}${day.minutes ? " has-work" : ""}"
                                        title="${escapeHtml(row.staff.name)}: ${day.hours}h of ${day.capacityHours}h on ${escapeHtml(day.date)}">
                                        <span class="capacity-bar" style="--fill:${pct}%"></span>
                                        ${day.minutes ? `<span class="capacity-hours">${day.hours}h</span>` : ""}
                                    </td>
                                `;
        }).join("")}
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

    /* =========================================================
       6. THE CALENDAR

       What is on a given day, across every site.

       The same renderer AGA uses, fed from this app's own projects -
       so the two companies' calendars are the same calendar.
       ========================================================= */

    function renderCalendar(config, plan, container, options) {
        if (!container) {
            return;
        }

        const settings = options || {};

        if (!plan || !plan.assignments.length) {
            container.innerHTML = `
                <div class="material-empty">
                    Nothing to show on a calendar yet. Press Auto-plan to build
                    the schedule.
                </div>
            `;
            return;
        }

        const calendar = global.PlanningCore.buildCalendar(plan, {
            dayCount: settings.dayCount || 15,
            startDate: settings.startDate || config.anchorDate()
        });

        const sites = sitesForCore(config.getProjects());
        const siteName = (id) => {
            const found = sites.find(site => site.id === id);
            return found ? found.name : "";
        };

        container.innerHTML = `
            <div class="calendar-strip">
                ${calendar.days.map(day => `
                    <div class="calendar-day${day.isToday ? " is-today" : ""}">
                        <div class="calendar-day-head">
                            <span class="calendar-day-name">${escapeHtml(config.shortDate(day.date))}</span>
                            <span class="calendar-day-load">${day.bookedMinutes
                ? `${global.PlanningCore.minutesToHours(day.bookedMinutes)}h booked`
                : "free"}</span>
                        </div>

                        ${day.starting.length
                ? `<div class="calendar-day-starting">${day.starting.length} starting</div>`
                : ""}

                        <ul class="calendar-day-items">
                            ${day.running.map(item => `
                                <li class="calendar-day-item">
                                    <span class="calendar-day-task">${escapeHtml(item.task)}</span>
                                    <span class="calendar-day-site">${escapeHtml(siteName(item.siteId))}</span>
                                    ${item.schedulable.length
                        ? `<span class="calendar-day-who">${escapeHtml(
                            item.schedulable
                                .map(id => (plan.staff.find(p => p.id === id) || {}).name)
                                .filter(Boolean)
                                .join(", ")
                        )}</span>`
                        : `<span class="calendar-day-unassigned">Nobody assigned</span>`}
                                </li>
                            `).join("")}
                        </ul>

                        ${day.crew.length
                ? `<div class="calendar-day-crew">${day.crew.map(entry => `
                                <span class="calendar-crew-chip${entry.overbooked ? " is-over" : ""}">
                                    ${escapeHtml(entry.staff.name.split(" ")[0])} ${entry.hours}h
                                </span>
                            `).join("")}</div>`
                : ""}
                    </div>
                `).join("")}
            </div>

            ${plan.warnings.length
                ? `<div class="plan-warnings">
                    ${plan.warnings.slice(0, 8).map(warning => `
                        <p class="plan-warning">${escapeHtml(warning.message)}</p>
                    `).join("")}
                </div>`
                : ""}
        `;
    }

    /* =========================================================
       7. THE ROSTER SCREEN

       Managing the people, which the apps had no way to do at all -
       `owner` was typed per task, so the same person existed twice
       under two spellings and had no capacity to book against.
       ========================================================= */

    function renderRoster(config, container) {
        if (!container) {
            return;
        }

        const roster = getRoster(config);

        if (!roster.length) {
            container.innerHTML = `
                <div class="material-empty">
                    No one on the roster yet. Give a task an owner and they
                    appear here, or add someone below.
                </div>
                <div class="roster-add">
                    <input type="text" id="rosterName" placeholder="Name" aria-label="Name">
                    <input type="number" id="rosterHours" min="1" max="24" step="0.5" value="8" aria-label="Hours per day">
                    <button type="button" class="primary-button compact" id="rosterAdd">Add person</button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="roster-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Hours / day</th>
                        <th>Active</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${roster.map(person => `
                        <tr data-staff-id="${escapeHtml(person.id)}">
                            <td>
                                <input type="text" class="roster-name" value="${escapeHtml(person.name)}"
                                    aria-label="Name for ${escapeHtml(person.name)}">
                            </td>
                            <td>
                                <input type="number" class="roster-hours" min="1" max="24" step="0.5"
                                    value="${person.hoursPerDay}" aria-label="Hours per day for ${escapeHtml(person.name)}">
                            </td>
                            <td>
                                <label class="roster-active">
                                    <input type="checkbox" class="roster-active-box"
                                        ${person.active !== false ? "checked" : ""}
                                        aria-label="${escapeHtml(person.name)} is active">
                                </label>
                            </td>
                            <td>
                                <button type="button" class="secondary-button compact roster-remove">
                                    Remove
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>

            <div class="roster-add">
                <input type="text" id="rosterName" placeholder="Name" aria-label="Name">
                <input type="number" id="rosterHours" min="1" max="24" step="0.5" value="8" aria-label="Hours per day">
                <button type="button" class="primary-button compact" id="rosterAdd">Add person</button>
            </div>
        `;

        wireRoster(config, container);
    }

    function wireRoster(config, container) {
        const save = () => {
            const next = [...container.querySelectorAll("tr[data-staff-id]")].map(row => {
                const existing = getRoster(config).find(
                    person => person.id === row.dataset.staffId
                ) || {};

                return {
                    ...existing,
                    id: row.dataset.staffId,
                    name: row.querySelector(".roster-name").value.trim(),
                    hoursPerDay: Number(row.querySelector(".roster-hours").value) || 8,
                    active: row.querySelector(".roster-active-box").checked
                };
            }).filter(person => person.name);

            setRoster(next);
        };

        container.querySelectorAll("input").forEach(input => {
            input.addEventListener("change", save);
        });

        container.querySelectorAll(".roster-remove").forEach(button => {
            button.addEventListener("click", () => {
                save();
                const id = button.closest("tr").dataset.staffId;
                setRoster(getRoster(config).filter(person => person.id !== id));
                renderRoster(config, container);
            });
        });

        const add = container.querySelector("#rosterAdd");
        if (add) {
            add.addEventListener("click", () => {
                const nameInput = container.querySelector("#rosterName");
                const hoursInput = container.querySelector("#rosterHours");
                const name = nameInput.value.trim();

                if (!name) {
                    nameInput.focus();
                    return;
                }

                const roster = getRoster(config);

                /* Do not add the same person twice: two rows for one
                   person means two sets of capacity for them, and the
                   scheduler will happily book them both at once. */
                const key = normaliseName(name);
                if (roster.some(person => normaliseName(person.name) === key)) {
                    return;
                }

                roster.push({
                    id: `owner-${key.replace(/[^a-z0-9]+/g, "-")}`,
                    name,
                    hoursPerDay: Number(hoursInput.value) || 8,
                    active: true
                });

                setRoster(roster);
                renderRoster(config, container);
            });
        }
    }

    /* =========================================================
       8. THE ORCHESTRATOR

       One call that redraws everything, so the board, the capacity
       strip and the calendar cannot drift out of step with each
       other - they are three reads of ONE plan, built once here.
       ========================================================= */

    function renderAll(config, elements) {
        const plan = buildAllProjectsPlan(config);

        renderSiteBoard(config, plan, elements.board);
        renderCapacityStrip(config, plan, elements.capacity, elements.capacityDays);
        renderCalendar(config, plan, elements.calendar, {
            dayCount: elements.calendarDays,
            startDate: elements.calendarStart
        });

        return plan;
    }

    /* Local escapeHtml: each app has its own, and this file must not
       depend on whichever loaded first. */
    function escapeHtml(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /* =========================================================
       9. DATE HELPERS

       Each app had its own idea of "today" and none of them matched
       PlanningCore's. Both supply a date to anchor the plan on, and
       the core has to agree with it or a plan can start on a day the
       app did not expect.

       These live here so both apps get the same one.
       ========================================================= */

    function todayIso() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    /*
       "Mon 5 Jan" - short enough for a column header, long enough to
       tell one working day from another.

       Built from the date's parts rather than toLocaleDateString alone,
       because the locale format can omit the month on a narrow header
       and leave two Januarys looking identical.
    */
    function shortDate(value) {
        if (!value) {
            return "-";
        }

        const parsed = typeof PlanningCore !== "undefined"
            ? PlanningCore.parseLocalDate(value)
            : null;

        if (!parsed) {
            return String(value);
        }

        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        return `${days[parsed.getDay()]} ${parsed.getDate()} ${months[parsed.getMonth()]}`;
    }

    global.SharedPlanning = {
        getRoster,
        setRoster,
        buildAllProjectsPlan,
        applyPlanToProjects,
        renderSiteBoard,
        renderCapacityStrip,
        renderCalendar,
        renderRoster,
        renderAll,
        normaliseName,
        rosterFromProjects,
        todayIso,
        shortDate
    };
})(typeof window !== "undefined" ? window : globalThis);

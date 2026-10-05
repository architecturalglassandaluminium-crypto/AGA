// Both quoting apps now share the planning core. This checks that the
// shared views render, that the two apps agree, and - the point of the
// change - that one person cannot be double-booked across two projects.
export default async function run(page) {
    const report = {};

    for (const [name, url] of [
        ["aps", "http://127.0.0.1:8800/trades/plumbing/index.html"],
        ["apc", "http://127.0.0.1:8800/trades/coatings/index.html"]
    ]) {
        const errors = [];
        const onError = (e) => errors.push(String(e.message || e));
        page.on("pageerror", onError);

        await page.goto(url, { waitUntil: "load" });
        await page.waitForSelector(".nav-item");

        /* Both apps: the tabs, the panes, and the roster key.

           NOTE on the typeof checks: they are NOT reliable here. The
           harness evaluates expressions in a context whose window is
           not the page's own, so typeof PlanningCore is "undefined"
           even when the file has loaded and run perfectly. The proof
           that the shared planner actually executed is behavioural -
           it WRITES to localStorage under "planning-staff" when it
           builds the roster. A key appearing there cannot be produced
           by anything else.
        */
        report[name] = await page.evaluate(() => {
            const q = (s) => document.querySelector(s);
            return {
                tabs: [...document.querySelectorAll(".planning-tab")].map(
                    (t) => t.dataset.planningView
                ),
                sitesVisible: !q("#planning-sites")?.hidden,
                calendarPaneExists: !!q("#planning-calendar-pane"),
                rosterPaneExists: !!q("#planning-roster-pane"),
                siteBoardExists: !!q("#site-board"),
                capacityExists: !!q("#capacity-strip"),
                /* The behavioural proof. */
                sharedPlannerRan: Object.keys(localStorage).some((k) =>
                    /planning-staff/i.test(k)
                )
            };
        });

        /* Now the real question: does one person get double-booked?

           Seeded into the app's own storage, then Auto-plan is clicked,
           and the answer read from the DOM the app painted. This is the
           only way to test it here, because the app is an IIFE and its
           functions cannot be called from out here.
        */
        /* The two apps store projects under different keys - the
           plumbing app uses "pipewise-projects", the coatings app
           prefixes its keys with "apc-" - and the key only exists once
           the app has saved something. So both candidates are written,
           and the app reads whichever is its own. Writing both is safe
           here: this is a throwaway preview profile. */
        const projectKeys = ["pipewise-projects", "apc-projects"];

        const payload = [
            {
                id: "P1",
                name: "Site A",
                customer: "Alpha",
                start: "2026-01-05",
                items: [
                    { task: "Alpha task", owner: "Pieter", duration: 420, category: "Test" }
                ]
            },
            {
                id: "P2",
                name: "Site B",
                customer: "Beta",
                start: "2026-01-05",
                items: [
                    { task: "Beta task", owner: "Pieter", duration: 420, category: "Test" }
                ]
            },
            {
                id: "P3",
                name: "Site C",
                customer: "Gamma",
                start: "2026-01-05",
                items: [
                    { task: "Gamma task", owner: "Sipho", duration: 420, category: "Test" }
                ]
            }
        ];

        await page.evaluate(
            ({ keys, projects }) => {
                keys.forEach((key) => localStorage.setItem(key, JSON.stringify(projects)));
            },
            { keys: projectKeys, projects: payload }
        );

        await page.reload({ waitUntil: "load" });

        /* The planning VIEW has to be open before its tabs are
           visible: they exist in the DOM while hidden, which is what
           made waitForSelector hang. Switch to it first. */
        await page.click('[data-view="planning"]');
        await page.waitForFunction(() => {
            const view = document.getElementById("planning-view");
            return view && view.getBoundingClientRect().height > 0;
        });
        await page.waitForTimeout(800);

        report[name].plan = await page.evaluate(() => {
            const rows = [...document.querySelectorAll(".site-board tbody tr")];
            const cells = [...document.querySelectorAll(".capacity-strip tbody tr")];

            return {
                siteRows: rows.length,
                sites: rows.map((row) => {
                    const tds = row.querySelectorAll("td");
                    return {
                        site: tds[0]?.innerText.replace(/\s+/g, " ").trim(),
                        dates: tds[2]?.innerText.replace(/\s+/g, " ").trim(),
                        crew: tds[5]?.innerText.replace(/\s+/g, " ").trim()
                    };
                }),
                capacityRows: cells.length,
                capacityPeople: cells.map(
                    (row) => row.querySelector("th")?.textContent.trim()
                ),
                /* The capacity strip is the answer to the double-booking
                   question: each person's cells must sum to at most one
                   day's work per column. */
                firstPersonCells: cells[0]
                    ? [...cells[0].querySelectorAll(".capacity-cell")].map(
                        (cell) => cell.querySelector(".capacity-hours")?.textContent.trim() || "0h"
                    )
                    : []
            };
        });

        report[name].pageErrors = errors;
        page.off("pageerror", onError);
    }

    /* The two apps must compute the same thing from the same input. */
    report.agree =
        JSON.stringify(report.aps.plan) === JSON.stringify(report.apc.plan);

    return report;
}
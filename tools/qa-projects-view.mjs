// Look at AGA's project management as it actually renders, with
// several projects in place, so the problem can be judged rather than
// guessed at from source.
import { writeFileSync } from "node:fs";

/* Seed a few realistic projects, the way the office would. */
const SEED = [
    {
        projectNumber: "PRJ-001",
        projectName: "Kroonstad Retirement Village",
        customerName: "Marla Viljoen",
        customerEmail: "marla@example.co.za",
        customerPhone: "082 555 0134",
        siteAddress: "12 Van der Walt Street, Kroonstad",
        createdAt: new Date("2026-01-08").toISOString(),
        dueDate: "2026-10-20",
        windows: [
            { id: "w1", windowId: "W-01", description: "Bedroom top hung", location: "Bedroom 1", lengthMm: 900, widthMm: 1200, frameColour: "Charcoal", glassType: "Clear", status: "Measured" },
            { id: "w2", windowId: "W-02", description: "Bathroom awning", location: "Bathroom", lengthMm: 600, widthMm: 800, frameColour: "White", glassType: "Frosted", status: "In Production" },
            { id: "w3", windowId: "W-03", description: "Lounge sliding door", location: "Lounge", lengthMm: 2400, widthMm: 2100, frameColour: "Charcoal", glassType: "Clear", status: "Installed" },
            { id: "w4", windowId: "W-04", description: "Kitchen casement", location: "Kitchen", lengthMm: 1000, widthMm: 800, frameColour: "Charcoal", glassType: "Clear", status: "Measured" }
        ]
    },
    {
        projectNumber: "PRJ-002",
        projectName: "Riverside Office Block",
        customerName: "Botha & Partners",
        customerEmail: "admin@bothapartners.co.za",
        customerPhone: "011 883 4400",
        siteAddress: "4 Rivonia Road, Sandton",
        createdAt: new Date("2026-08-02").toISOString(),
        dueDate: "2026-10-02",
        windows: [
            { id: "w5", windowId: "W-01", description: "Shopfront", location: "Ground floor", lengthMm: 3600, widthMm: 2400, frameColour: "Bronze", glassType: "Tinted", status: "In Production" },
            { id: "w6", windowId: "W-02", description: "Office partitions", location: "Floor 2", lengthMm: 1800, widthMm: 900, frameColour: "Bronze", glassType: "Clear", status: "Measured" }
        ]
    },
    {
        projectNumber: "PRJ-003",
        projectName: "Hartbeespoort House",
        customerName: "Johan Steyn",
        customerEmail: "",
        customerPhone: "",
        siteAddress: "Plot 42, Hartbeespoort",
        createdAt: new Date("2025-11-20").toISOString(),
        dueDate: "",
        windows: []
    }
];

export default async function run(page) {
    await page.goto("http://127.0.0.1:8800/index.html", { waitUntil: "load" });
    /* #projectsList exists while its view is hidden, so wait for the
       view itself rather than for the container. */
    await page.waitForSelector('[data-view="projects"]');

    /*
       The seed is written to storage and read back through the app's
       OWN loader, without reloading the page.

       Two things this has to avoid:

         - writing before a reload, because the app syncs projects to
           the cloud on load and overwrites it (an earlier version of
           this check reported five projects where three were seeded);
         - calling an app function directly, because renderProjects is
           module-scoped and not on window.

       So: clear the key, click New Project once so the app loads
       from an empty store, seed, then dispatch the search input event
       that the app already listens for. That redraws the list from
       storage through the real code path, including sort and filter.
    */
    await page.evaluate(() => {
        localStorage.removeItem("aga_projects");
    });
    await page.click('[data-view="projects"]');
    await page.waitForTimeout(300);

    await page.evaluate((seed) => {
        localStorage.setItem("aga_projects", JSON.stringify(seed));
        /* The one event the app listens for to redraw the list. */
        const box = document.getElementById("projectSearch");
        box.value = "";
        box.dispatchEvent(new Event("input", { bubbles: true }));
    }, SEED);

    await page.waitForFunction(() =>
        document.querySelectorAll(".project-card").length >= 3
    );
    await page.click('[data-view="projects"]');
    await page.waitForFunction(() => {
        const view = document.getElementById("projects-view");
        return view && view.getBoundingClientRect().height > 0;
    });
    await page.waitForTimeout(200);

    const report = await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".project-card")];

        return {
            projectCount: cards.length,
            /* How many separate action buttons does one project carry? */
            actionButtonsPerCard: cards.map(
                (c) => c.querySelectorAll(".card-action").length
            ),
            actionLabels: cards[0]
                ? [...cards[0].querySelectorAll(".card-action")].map((b) =>
                    b.textContent.replace(/\s+/g, " ").trim()
                )
                : [],
            /* Is there any way to see an at-a-glance summary? */
            hasSortControl: !!document.querySelector("#projectsList select, #projectsList button[aria-sort], #projectSort"),
            hasStatusFilter: !!document.querySelector("#projectStatusFilter"),
            hasViewToggle: !!document.querySelector("#projectViewToggle"),
            /* How tall is one card, i.e. how much scrolling to find
               the next project? */
            cardHeights: cards.map((c) => Math.round(c.getBoundingClientRect().height)),
            pageHeight: document.documentElement.scrollHeight,
            /* Does the list render its window rows inline, or on demand? */
            tablesInline: document.querySelectorAll("#projectsList table").length,
            headerCount: document.querySelectorAll("#projectsList thead th").length
        };
    });

    writeFileSync("tmp-projects.png", Buffer.from(await page.screenshot({ fullPage: false })));

    /* ---- the controls actually work ---- */
    await page.selectOption("#projectSort", "newest");
    await page.waitForTimeout(150);
    const byNewest = await page.evaluate(() =>
        [...document.querySelectorAll(".project-card-title strong")].map((n) =>
            n.textContent.trim()
        )
    );

    await page.selectOption("#projectStatusFilter", "notstarted");
    await page.waitForTimeout(150);
    const notStarted = await page.evaluate(() => ({
        cards: document.querySelectorAll(".project-card").length,
        count: document.getElementById("projectListCount")?.textContent.trim()
    }));

    await page.selectOption("#projectStatusFilter", "");
    await page.selectOption("#projectSort", "due");
    await page.waitForTimeout(150);

    /* ---- the collapsed schedule opens ---- */
    const collapse = await page.evaluate(() => {
        const all = [...document.querySelectorAll(".project-windows")];
        return {
            detailsBlocks: all.length,
            openByDefault: all.filter((d) => d.open).length,
            summaryLabel: all[0]
                ?.querySelector(".project-windows-summary")?.textContent
                .replace(/\s+/g, " ").trim(),
            /* The rows are still in the DOM, just hidden - a scan can
               still find them. */
            rowsStillPresent: document.querySelectorAll(
                ".project-windows tbody tr"
            ).length
        };
    });

    /* ---- overdue flagging ---- */
    const dueFlags = await page.evaluate(() =>
        [...document.querySelectorAll(".due-flag")].map((n) =>
            n.textContent.replace(/\s+/g, " ").trim()
        )
    );

    /* ---- opening a schedule by clicking it ---- */
    const closed = page.locator(".project-windows:not([open])").first();
    if (await closed.count()) {
        await closed.locator("summary").click();
        await page.waitForTimeout(150);
    }
    const openedByClick = await page.evaluate(
        () => document.querySelectorAll(".project-windows[open]").length
    );

    return { ...report, byNewest, notStarted, collapse, dueFlags, openedByClick };
}
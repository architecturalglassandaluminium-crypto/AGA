// Both trade apps lost the quick-start scenario box. The wiring that
// fed it (the two sync functions, the Add scenario button) is gone
// from the page, so this checks the apps still boot without a
// console error and the quote form still renders.
//
//   node <skill>/browser.mjs http://127.0.0.1:8800/ --script tools/qa-no-scenario-box.mjs
//
// The URLs name index.html explicitly: preview-server.js only maps the
// bare site root to index.html, so a directory URL such as
// /trades/plumbing/ is a 404 on it. (tools/qa-server.js does resolve
// directories, but it is rooted at tools/ and cannot reach the apps.)
export default async function run(page) {
    const report = {};

    for (const [name, url] of [
        ["aps_plumbing", "http://127.0.0.1:8800/trades/plumbing/index.html"],
        ["apc_coatings", "http://127.0.0.1:8800/trades/coatings/index.html"]
    ]) {
        const errors = [];
        const onError = (e) => errors.push(String(e.message || e));
        page.on("pageerror", onError);

        await page.goto(url, { waitUntil: "load" });
        await page.waitForSelector(".nav-item", { state: "attached" });

        report[name] = await page.evaluate(() => ({
            /* The box must be gone from the quote form... */
            scenarioBoxGone: !document.querySelector(".scenario-panel"),
            scenarioSelectGone: !document.getElementById("scenario-select"),
            addScenarioButtonGone: !document.getElementById("add-scenario"),

            /* ...but the scenario LIBRARY must survive: it is still a
               view, still wired, and is how scenarios are maintained. */
            scenarioLibraryStillThere: !!document.getElementById("scenarios-view"),
            scenarioEditorStillWired: !!document.getElementById("scenario-editor-select"),
            scenarioEditorHasOptions:
                (document.getElementById("scenario-editor-select")?.options.length || 0) > 0,

            /* The quote form itself must be intact and in reading
               order: customer, labour, materials, services. */
            sectionHeadings: [...document.querySelectorAll(".section-heading h2")]
                .map((h) => h.textContent.replace(/\s+/g, " ").trim()),
            addServiceStillWired: !!document.getElementById("add-service"),
            printDetailsStillPresent: !!document.getElementById("print-details")
        }));

        report[name].pageErrors = errors;
        page.off("pageerror", onError);
    }

    return report;
}
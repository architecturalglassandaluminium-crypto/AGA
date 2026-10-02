// Verify the scenario library in the RUNNING app, not by parsing
// source. Parsing is how the previous audit lied: it reported tasks
// that were in fact catalogued and priced.
export default async function run(page) {
    await page.goto("http://127.0.0.1:8800/trades/coatings/index.html", {
        waitUntil: "load"
    });
    await page.waitForSelector(".nav-item");

    /*
       The library is a module-local const, so it cannot be read
       directly. It can be exercised instead: open the Scenarios view
       and read what the editor offers. That is the thing the user
       actually touches, so it is the thing worth checking.
    */
    await page.click('[data-view="scenarios"]');
    await page.waitForSelector("#scenario-editor-select");

    return page.evaluate(() => {
        const select = document.getElementById("scenario-editor-select");
        const options = [...select.options].map((o) => ({
            value: o.value,
            label: o.textContent.replace(/\s+/g, " ").trim()
        }));
        const groups = [...select.querySelectorAll("optgroup")].map((g) => ({
            label: g.label,
            count: g.children.length
        }));

        return {
            totalScenarios: options.length,
            groups,
            /* Spot-check that the new work is actually reachable. */
            hasElectrical: options.filter((o) => /electric|light|fan|dimmer|geyser|oven|fence|meter|data|cab/i.test(o.label)).map((o) => o.label),
            hasConstruction: options.filter((o) => /braai|screed|lintel|garage|foundation|tiled shower|tiles|membrane|truss|bathroom|kitchen|rainwater/i.test(o.label)).map((o) => o.label),
            hasSafety: options.filter((o) => /scaffold|health and safety|fencing/i.test(o.label)).map((o) => o.label)
        };
    });
}
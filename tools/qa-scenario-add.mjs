// The scenario bar has to actually ADD to a quote, not just be
// present. This drives it: pick a scenario, press Add, and check the
// services table grew and the total moved.
import { writeFileSync } from "node:fs";

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
        await page.waitForSelector(".nav-item");

        /* The bar is on the quote view, not the Scenarios view. */
        const barOnQuoteView = await page.locator(".scenario-bar").isVisible();

        const before = await page.evaluate(() => ({
            options: document.getElementById("scenario-select").options.length,
            serviceRows: document.querySelectorAll("#service-list .service-row").length,
            total: document.getElementById("totals-services")?.textContent?.trim(),
            grandTotal: document.getElementById("grand-total")?.textContent?.trim()
        }));

        /*
           Pick the first REAL library scenario - option 0 is the
           "Select a job scenario" placeholder, and option 1 may be a
           disabled optgroup label.
        */
        const picked = await page.evaluate(() => {
            const select = document.getElementById("scenario-select");
            const real = [...select.options].find(
                (o) => o.value && o.value !== ""
            );
            if (!real) return null;
            select.value = real.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            return real.textContent.replace(/\s+/g, " ").trim();
        });

        await page.click("#add-scenario");
        await page.waitForTimeout(400);

        const after = await page.evaluate(() => ({
            serviceRows: document.querySelectorAll("#service-list .service-row").length,
            total: document.getElementById("totals-services")?.textContent?.trim(),
            grandTotal: document.getElementById("grand-total")?.textContent?.trim(),
            /* The picker must reset, or adding the same scenario twice
               in a row silently adds it once. */
            selectValue: document.getElementById("scenario-select").value,
            toast: document.getElementById("toast")?.textContent?.trim()
        }));

        writeFileSync(
            `tmp-scenario-${name}.png`,
            Buffer.from(await page.screenshot())
        );

        report[name] = {
            barOnQuoteView,
            scenarioChoicesOffered: before.options - 1,
            picked,
            serviceRowsBefore: before.serviceRows,
            serviceRowsAfter: after.serviceRows,
            servicesWereAdded: after.serviceRows > before.serviceRows,
            totalBefore: before.total,
            totalAfter: after.total,
            totalMoved: before.total !== after.total,
            selectResetAfterAdd: after.selectValue === "",
            toastSaysWhichScenario: /Scenario ".+" added/.test(after.toast || ""),
            pageErrors: errors
        };

        page.off("pageerror", onError);
    }

    return report;
}
// Render the generic quote and report what actually came out, so the
// document is checked rather than assumed.
import { writeFileSync } from "node:fs";

export default async function run(page, ui) {
    await page.goto("http://127.0.0.1:8800/docs/generic-quote.html", { waitUntil: "load" });

    const report = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const rows = [...document.querySelectorAll(".schedule tbody tr")];
        const sections = [...document.querySelectorAll(".section-head")].map(
            (tr) => tr.textContent.replace(/\s+/g, " ").trim()
        );
        const totals = [...document.querySelectorAll(".costing tfoot tr")].map(
            (tr) => tr.textContent.replace(/\s+/g, " ").trim()
        );
        const schedule = q(".schedule");

        return {
            title: document.title,
            hasLetterhead: !!q(".letterhead"),
            letterheadName: q(".letterhead-name")?.textContent.trim(),
            hasTitleblock: !!q(".titleblock"),
            scheduleColumns: [...document.querySelectorAll(".schedule thead th")].map(
                (th) => th.textContent.trim()
            ),
            scheduleRows: rows.length,
            sections,
            everySectionHasATotal:
                sections.length ===
                document.querySelectorAll(".section-total").length,
            costingRows: totals,
            hasTerms: !!q(".terms"),
            termsOnItsOwnPage: q(".terms")
                ? getComputedStyle(q(".terms")).breakBefore
                : null,
            acceptanceBlocks: document.querySelectorAll(".signature-block").length,
            /* The point of the change: no scenario anywhere on the
               document. */
            mentionsScenario: /scenario/i.test(document.body.innerText),
            /* A schedule wider than the page silently drops a column. */
            scheduleFitsPage: schedule
                ? schedule.getBoundingClientRect().width <= window.innerWidth
                : null,
            bodyText: q("body").innerText.replace(/\s+/g, " ").slice(0, 400),
        };
    });

    await page.screenshot({ path: "tmp-generic-quote.png", fullPage: true });
    writeFileSync("tmp-generic-quote.png", Buffer.from(await page.screenshot({ fullPage: true })));

    return report;
}
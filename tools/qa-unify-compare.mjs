// Side-by-side of the two quoting apps' quote form, so the unified
// look can be compared rather than assumed.
import { writeFileSync } from "node:fs";

export default async function run(page) {
    const report = {};

    for (const [name, url] of [
        ["aps", "http://127.0.0.1:8800/trades/plumbing/index.html"],
        ["apc", "http://127.0.0.1:8800/trades/coatings/index.html"]
    ]) {
        await page.goto(url, { waitUntil: "load" });
        await page.waitForSelector(".primary-button");
        await page.waitForTimeout(250);

        report[name] = await page.evaluate(() => {
            const cs = (sel, prop) => {
                const el = document.querySelector(sel);
                return el ? getComputedStyle(el)[prop] : null;
            };
            const h = (sel) => {
                const el = document.querySelector(sel);
                return el ? Math.round(el.getBoundingClientRect().height) : null;
            };

            return {
                primaryBackground: cs(".primary-button", "backgroundColor"),
                primaryInk: cs(".primary-button", "color"),
                primaryHeight: h(".primary-button"),
                primaryRadius: cs(".primary-button", "borderRadius"),
                navActiveBackground: cs(".nav-item.active", "backgroundColor"),
                navActiveInk: cs(".nav-item.active", "color"),
                scenarioBarBackground: cs(".scenario-bar", "backgroundColor"),
                fieldRadius: cs(".field select", "borderRadius"),
                fieldFocusShadow: cs(".field select", "boxShadow"),
                /* The two apps must agree on every one of these. */
                pageBackground: cs("body", "backgroundColor")
            };
        });

        writeFileSync(`tmp-unified-${name}.png`, Buffer.from(await page.screenshot()));
    }

    /* Every shared value must be identical across the two apps. */
    const keys = [
        "primaryBackground",
        "primaryInk",
        "primaryRadius",
        "navActiveBackground",
        "navActiveInk"
    ];
    report.drift = keys.filter((k) => report.aps[k] !== report.apc[k]);

    return report;
}
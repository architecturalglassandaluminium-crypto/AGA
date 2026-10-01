// Every trade must show its OWN logo, and the floating switcher must
// not sit on top of the quoting apps' own logos.
//
// The second point is the regression that started this: the pill was
// pinned to the top-left, which is exactly where both quoting apps
// put their logo and menu, so it covered the company's mark on every
// screen. This measures overlap rather than trusting a CSS rule.
import { writeFileSync } from "node:fs";

const shot = async (page, name) => {
    writeFileSync(name, Buffer.from(await page.screenshot()));
};

export default async function run(page) {
    const report = {};

    /* ---- the production app's own header ---- */
    await page.goto("http://127.0.0.1:8800/", { waitUntil: "load" });
    await page.waitForSelector("#company-logo");

    report.glass = await page.evaluate(() => {
        const img = document.getElementById("company-logo");
        return {
            logoSrc: img.getAttribute("src"),
            logoLoaded: img.complete && img.naturalWidth > 0,
            logoNatural: `${img.naturalWidth}x${img.naturalHeight}`,
            /* The plate must be white: the AGA file has a grey field
               and would otherwise show as a grey box on dark blue. */
            plateBackground: getComputedStyle(
                document.querySelector(".company-mark")
            ).backgroundColor,
            name: document.getElementById("company-name").textContent.trim(),
            /* An ampersand must render as &, not as the literal "&amp;". */
            nameHasRawEntity: /&(amp|#38);/.test(
                document.getElementById("company-name").innerHTML
            )
        };
    });
    await shot(page, "tmp-logo-glass.png");

    /* ---- each quoting trade ---- */
    for (const [trade, expected] of [
        ["plumbing", "Architectural Plumbing Services"],
        ["coatings", "Architectural Performance Coatings"]
    ]) {
        await page.goto("http://127.0.0.1:8800/", { waitUntil: "load" });
        await page.click(`[data-trade="${trade}"]`);
        await page.waitForSelector(".trade-frame:not([hidden])");

        /*
           Wait for the frame's app to actually be ready, not merely
           for the iframe element to exist. Without this the logo and
           the geometry below are read while the embedded app is still
           parsing, and the check reports a failure that is really just
           a race - a null logo area one run and a real number the next.
        */
        await page
            .frameLocator(`.trade-frame:not([hidden])`)
            .locator(".sidebar .brand-logo")
            .waitFor({ state: "visible", timeout: 20000 });
        await page.waitForFunction(() => {
            const img = document.getElementById("company-logo");
            return img && img.complete && img.naturalWidth > 0;
        });

        report[trade] = await page.evaluate((expected) => {
            const img = document.getElementById("company-logo");
            const name = document.getElementById("company-name").textContent.trim();
            return {
                logoSrc: img.getAttribute("src"),
                logoLoaded: img.complete && img.naturalWidth > 0,
                /* The header must name the SELECTED company, not the page's own.
                   Catches identity text that never got repainted. */
                nameIsCorrect: name === expected,
                name,
                tagline: document.getElementById("company-tagline").textContent.trim(),
                pillVisible: (() => {
                    const pill = document.querySelector(".app-header");
                    return pill.getBoundingClientRect().width > 0;
                })(),
                /* Where the pill actually is, so the overlap check has
                                   something to compare against.

                                   Measured from its RIGHT edge, not its left: the pill
                                   is wide (it carries the switcher), so its left edge
                                   can sit left of the window midpoint even when the
                                   pill is plainly in the right-hand corner. */
                pillCorner: (() => {
                    const r = document.querySelector(".app-header").getBoundingClientRect();
                    const right = r.right > window.innerWidth - 40;
                    const bottom = r.bottom > window.innerHeight - 40;
                    return `${bottom ? "bottom" : "top"}-${right ? "right" : "left"}`;
                })(),
                activeButton: document.querySelector(
                    ".trade-button.active"
                )?.textContent.trim()
            };
        }, expected);

        /* The overlap that matters: the switcher pill against the
           QUOTING APP's own logo and menu, across the iframe
           boundary.

           Measured from INSIDE the frame, then the frame's own offset
           on the page is added, so both rectangles are in page
           coordinates. Asking the parent document for a selector that
           lives in the frame returns null - each document can only
           see its own nodes. */
        const boxInPage = await page.evaluate(() => {
            const frame = document.querySelector(".trade-frame:not([hidden])");
            const doc = frame.contentDocument;
            const host = frame.getBoundingClientRect();
            const at = (sel) => {
                const el = doc.querySelector(sel);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return {
                    left: r.left + host.left,
                    top: r.top + host.top,
                    right: r.right + host.left,
                    bottom: r.bottom + host.top
                };
            };
            return {
                appLogo: at(".sidebar .brand-logo"),
                appMenu: at(".sidebar .nav-item"),
                pill: (() => {
                    const r = document
                        .querySelector(".app-header")
                        .getBoundingClientRect();
                    return {
                        left: r.left,
                        top: r.top,
                        right: r.right,
                        bottom: r.bottom
                    };
                })()
            };
        });

        const area = (r) =>
            r ? Math.round((r.right - r.left) * (r.bottom - r.top)) : null;
        const intersects = (a, b) => {
            if (!a || !b) return null;
            const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
            const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
            return Math.round(w * h);
        };

        report[trade].appLogoFound = area(boxInPage.appLogo);
        report[trade].pillOverlapsAppLogo = intersects(
            boxInPage.pill,
            boxInPage.appLogo
        );
        report[trade].pillOverlapsAppMenu = intersects(
            boxInPage.pill,
            boxInPage.appMenu
        );

        await shot(page, `tmp-logo-${trade}.png`);
    }

    return report;
}
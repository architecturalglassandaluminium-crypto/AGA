// Compare the three apps side by side: the same controls, measured
// rather than eyeballed. Reports each button's colours, size and
// WCAG contrast so "more user friendly" is a number, not a claim.
import { writeFileSync } from "node:fs";

/* WCAG relative luminance and contrast ratio. */
function contrast(rgb1, rgb2) {
    const lum = (c) => {
        const [r, g, b] = c.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = lum(rgb1);
    const b = lum(rgb2);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}

const parse = (value) => {
    const m = String(value).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(",").map((n) => parseFloat(n));
    return parts.length > 3 && parts[3] === 0 ? null : parts.slice(0, 3);
};

async function measure(page, url, frame) {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector(".primary-button");

    return page.evaluate((inFrame) => {
        const doc = inFrame
            ? document.querySelector(".trade-frame:not([hidden])")?.contentDocument
            : document;
        if (!doc) return { error: "no document" };

        const pick = (sel) => doc.querySelector(sel);
        const box = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return {
                background: s.backgroundColor,
                color: s.color,
                height: Math.round(r.height),
                minHeight: s.minHeight,
                fontSize: s.fontSize,
                fontWeight: s.fontWeight
            };
        };

        return {
            primary: box(pick(".primary-button")),
            secondary: box(pick(".secondary-button")),
            textButton: box(pick(".text-button"))
        };
    }, frame);
}

export default async function run(page) {
    const report = {};

    for (const [name, url, frame] of [
        ["aga", "http://127.0.0.1:8800/index.html", false],
        ["aps", "http://127.0.0.1:8800/trades/plumbing/index.html", false],
        ["apc", "http://127.0.0.1:8800/trades/coatings/index.html", false]
    ]) {
        const measured = await measure(page, url, frame);
        report[name] = measured;

        if (measured.primary) {
            const bg = parse(measured.primary.background);
            const fg = parse(measured.primary.color);
            report[name].primaryContrast = bg && fg ? contrast(bg, fg) : null;
            /* WCAG AA for normal text is 4.5:1. */
            report[name].primaryPassesAA =
                report[name].primaryContrast !== null &&
                report[name].primaryContrast >= 4.5;
            report[name].primaryIs44px = measured.primary.height >= 44;
            /*
               The 44px floor, not just the minimum: an inherited
               content-box can push the rendered height past it by
               adding padding outside the box.
            */
            report[name].primaryNotOversized = measured.primary.height <= 48;
        }
        if (measured.secondary) {
            const bg = parse(measured.secondary.background);
            const fg = parse(measured.secondary.color);
            report[name].secondaryContrast = bg && fg ? contrast(bg, fg) : null;
        }
    }

    /* The static top bar. */
    await page.goto("http://127.0.0.1:8800/index.html", { waitUntil: "load" });
    await page.click('[data-trade="plumbing"]');
    await page.waitForSelector(".trade-frame:not([hidden])");

    report.switcherBar = await page.evaluate(() => {
        const header = document.querySelector(".app-header");
        const r = header.getBoundingClientRect();
        return {
            position: getComputedStyle(header).position,
            top: Math.round(r.top),
            left: Math.round(r.left),
            width: Math.round(r.width),
            /* A static bar sits at the top and spans the window. */
            isAtTop: r.top <= 1,
            spansWindow: r.width >= window.innerWidth - 1,
            buttons: [...document.querySelectorAll(".trade-button")].map((b) => {
                const br = b.getBoundingClientRect();
                return {
                    label: b.textContent.replace(/\s+/g, " ").trim(),
                    height: Math.round(br.height),
                    visible: br.width > 0
                };
            })
        };
    });

    writeFileSync("tmp-unified.png", Buffer.from(await page.screenshot()));

    return report;
}
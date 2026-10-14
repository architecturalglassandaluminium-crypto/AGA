/*
 * Provisional Crealco frame-perimeter estimator.
 *
 * This intentionally estimates one generic profile only. Crealco
 * series-specific deductions, sash layouts, mullions, beads and hardware
 * require the manufacturer's cutting schedule and are not inferred here.
 */
(function (root, factory) {
    const estimator = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = estimator;
    }

    root.CrealcoProfileEstimator = estimator;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const STOCK_LENGTH_MM = 6000;
    const SAW_KERF_MM = 3;

    function dimension(value) {
        if (typeof value === "number") {
            return Number.isFinite(value) && value > 0 ? value : null;
        }

        const parsed = Number(String(value ?? "").trim());
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }

    function packCuts(cuts) {
        const bars = [];

        [...cuts]
            .sort((a, b) => b - a)
            .forEach(cut => {
                const required = cut + SAW_KERF_MM;
                let bar = bars.find(item => item.remaining >= required);

                if (!bar) {
                    bar = { remaining: STOCK_LENGTH_MM };
                    bars.push(bar);
                }

                bar.remaining -= required;
            });

        return bars;
    }

    function estimateProject(project) {
        const windows = Array.isArray(project?.windows) ? project.windows : [];
        const rows = [];
        const cuts = [];
        const pending = [];

        windows.forEach((window, index) => {
            const length = dimension(window.length);
            const width = dimension(window.width);
            const id = String(window.windowNumber || window.id || `Item ${index + 1}`);

            if (!length || !width) {
                pending.push({ id, reason: "Both dimensions are required." });
                rows.push({ id, length, width, perimeter: null, cuts: [] });
                return;
            }

            const itemCuts = [length, length, width, width];
            const overlength = itemCuts.some(cut => cut + SAW_KERF_MM > STOCK_LENGTH_MM);

            if (overlength) {
                pending.push({
                    id,
                    reason: "At least one frame member is longer than a 6,000 mm stock bar."
                });
                rows.push({ id, length, width, perimeter: length * 2 + width * 2, cuts: itemCuts, overlength: true });
                return;
            }

            cuts.push(...itemCuts);
            rows.push({
                id,
                length,
                width,
                perimeter: length * 2 + width * 2,
                cuts: itemCuts,
                overlength: false
            });
        });

        const bars = packCuts(cuts);
        const totalCutLength = cuts.reduce((total, cut) => total + cut, 0);

        return {
            rows,
            pending,
            cutCount: cuts.length,
            totalCutLength,
            stockLength: STOCK_LENGTH_MM,
            stockBars: bars.length,
            stockLengthTotal: bars.length * STOCK_LENGTH_MM,
            estimatedOffcut: bars.reduce((total, bar) => total + bar.remaining, 0)
        };
    }

    return Object.freeze({
        STOCK_LENGTH_MM,
        SAW_KERF_MM,
        estimateProject
    });
}));

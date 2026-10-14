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
    const PALACE_MANUAL = Object.freeze({
        revision: "Rev. 9 (2025-02-26)",
        sourceUrl: "https://crealco.co.za/wp-content/uploads/2025/12/Rev.9-2025-02-26-Palace-Manual.pdf",
        profiles: Object.freeze([
            Object.freeze({ code: "W31533", description: "Palace M Frame Head Rail Double" }),
            Object.freeze({ code: "W31590", description: "Palace M Adaptor Frame Jamb 14mm" }),
            Object.freeze({ code: "W55433", description: "Palace M Frame Jamb Double" }),
            Object.freeze({ code: "W31539", description: "Palace M Frame Sill Rail Double 50mm" }),
            Object.freeze({ code: "W31537", description: "Palace M Frame Head Rail Triple" }),
            Object.freeze({ code: "W55434", description: "Palace M Frame Jamb Triple" }),
            Object.freeze({ code: "W31535", description: "Palace M Frame Sill Rail Triple 50mm" }),
            Object.freeze({ code: "W26282", description: "Palace M Track 10mm" }),
            Object.freeze({ code: "W58916", description: "Palace Multi Sill Extension" }),
            Object.freeze({ code: "W54966", description: "Palace Multi Stile Meeting 90mm" }),
            Object.freeze({ code: "W56607", description: "Palace Multi Stile Meeting 65mm" }),
            Object.freeze({ code: "W58268", description: "Palace Multi Stile Meeting 60mm" }),
            Object.freeze({ code: "W53100", description: "Palace Multi Stile Meeting 39mm" }),
            Object.freeze({ code: "GFP-6790", description: "6.7 x 9mm finseal for Palace retention rail" })
        ]),
        sillExtensionEndCapAllowanceMm: 4
    });

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
            .sort((a, b) => b.length - a.length)
            .forEach(cut => {
                const required = cut.length + SAW_KERF_MM;
                let bar = bars.find(item => item.remaining >= required);

                if (!bar) {
                    bar = { cuts: [], remaining: STOCK_LENGTH_MM };
                    bars.push(bar);
                }

                bar.remaining -= required;
                bar.cuts.push(cut);
            });

        return bars.map((bar, index) => ({
            number: index + 1,
            cuts: bar.cuts,
            usedLength: bar.cuts.reduce((total, cut) => total + cut.length, 0),
            kerf: bar.cuts.length * SAW_KERF_MM,
            remaining: bar.remaining
        }));
    }

    function estimatePalaceSillExtension(overallDimension) {
        const measuredDimension = dimension(overallDimension);
        const endCapAllowanceEachEnd = PALACE_MANUAL.sillExtensionEndCapAllowanceMm;
        const totalAllowance = endCapAllowanceEachEnd * 2;

        if (!measuredDimension || measuredDimension <= totalAllowance) {
            return null;
        }

        return {
            measuredDimensionMm: measuredDimension,
            endCapAllowanceEachEndMm: endCapAllowanceEachEnd,
            totalEndCapAllowanceMm: totalAllowance,
            cutLengthMm: measuredDimension - totalAllowance
        };
    }

    function estimateProject(project) {
        const windows = Array.isArray(project?.windows) ? project.windows : [];
        const rows = [];
        const cuts = [];
        const pending = [];

        windows.forEach((window, index) => {
            const length = dimension(window.length);
            const width = dimension(window.height) || dimension(window.width);
            const id = String(window.windowNumber || window.id || `Item ${index + 1}`);

            if (!length || !width) {
                pending.push({ id, reason: "Both dimensions are required." });
                rows.push({ id, length, width, perimeter: null, cuts: [] });
                return;
            }

            const itemCuts = [
                { length, member: "Width 1" },
                { length, member: "Width 2" },
                { length: width, member: "Height 1" },
                { length: width, member: "Height 2" }
            ];
            const overlength = itemCuts.some(cut => cut.length + SAW_KERF_MM > STOCK_LENGTH_MM);

            if (overlength) {
                pending.push({
                    id,
                    reason: "At least one frame member is longer than a 6,000 mm stock bar."
                });
                rows.push({
                    id,
                    length,
                    width,
                    perimeter: length * 2 + width * 2,
                    cuts: itemCuts.map(cut => cut.length),
                    overlength: true
                });
                return;
            }

            cuts.push(...itemCuts.map(cut => ({ ...cut, itemId: id })));
            rows.push({
                id,
                length,
                width,
                perimeter: length * 2 + width * 2,
                cuts: itemCuts.map(cut => cut.length),
                overlength: false
            });
        });

        const bars = packCuts(cuts);
        const totalCutLength = cuts.reduce((total, cut) => total + cut.length, 0);

        return {
            rows,
            pending,
            bars,
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
        estimateProject,
        PALACE_MANUAL,
        estimatePalaceSillExtension
    });
}));

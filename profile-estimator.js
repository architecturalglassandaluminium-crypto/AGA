/*
 * Provisional material takeoff from opening dimensions. Fabrication cuts
 * must still be verified against the current StarFront cutting schedule.
 */
(function (root, factory) {
    const estimator = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = estimator;
    }

    root.CrealcoProfileEstimator = estimator;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

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

    const CASEMENT_28_MANUAL = Object.freeze({
        revision: "October 2013",
        profiles: Object.freeze([
            Object.freeze({ code: "W52692", description: "Casement 28 equal-leg standard outer frame" }),
            Object.freeze({ code: "W52694", description: "Casement 28 unequal-leg standard outer frame" }),
            Object.freeze({ code: "W52007", description: "Casement 28 54 mm outer frame" }),
            Object.freeze({ code: "W70963", description: "Casement 28 70 mm outer frame" }),
            Object.freeze({ code: "W52699", description: "Casement 28 standard sash" }),
            Object.freeze({ code: "W52695", description: "Casement 28 corner cleat" })
        ]),
        defaultFrameProfileCode: "W52692",
        sashProfileCode: "W52699",
        cornerCleatCode: "W52695"
    });

    function dimension(value) {
        if (typeof value === "number") {
            return Number.isFinite(value) && value > 0 ? value : null;
        }

        const parsed = Number(String(value ?? "").trim());
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
        const pending = [];
        let grossPerimeterMm = 0;

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
                length,
                length,
                width,
                width
            ];
            const perimeter = itemCuts.reduce((total, dimension) => total + dimension, 0);
            grossPerimeterMm += perimeter;
            rows.push({
                id,
                length,
                width,
                perimeter,
                cuts: itemCuts
            });
        });

        return {
            rows,
            pending,
            grossPerimeterMm,
            memberDimensionCount: rows.reduce((total, row) => total + row.cuts.length, 0)
        };
    }

    function estimateCasement28(project, options = {}) {
        const windows = Array.isArray(project?.windows) ? project.windows : [];
        const selectedFrameProfile = CASEMENT_28_MANUAL.profiles.find(profile =>
            profile.code === options.frameProfileCode &&
            profile.code !== CASEMENT_28_MANUAL.sashProfileCode &&
            profile.code !== CASEMENT_28_MANUAL.cornerCleatCode
        );
        const frameProfile = selectedFrameProfile || CASEMENT_28_MANUAL.profiles.find(profile =>
            profile.code === CASEMENT_28_MANUAL.defaultFrameProfileCode
        );
        const sashProfile = CASEMENT_28_MANUAL.profiles.find(profile =>
            profile.code === CASEMENT_28_MANUAL.sashProfileCode
        );
        const cornerCleat = CASEMENT_28_MANUAL.profiles.find(profile =>
            profile.code === CASEMENT_28_MANUAL.cornerCleatCode
        );
        const sashCounts = options.sashCounts || [];
        const rows = [];
        const pending = [];
        const profileTotals = new Map();
        let cornerCleatQuantity = 0;

        windows.forEach((window, index) => {
            const width = dimension(window.length) || dimension(window.finalWidth);
            const height = dimension(window.height) ||
                dimension(window.width) ||
                dimension(window.finalHeight);
            const id = String(window.windowNumber || window.id || `Item ${index + 1}`);
            const productType = String(window.productType || window.windowType || "").toLowerCase();
            const hasUnitCount = window.quantity !== undefined &&
                window.quantity !== null &&
                String(window.quantity).trim() !== "";
            const countValue = hasUnitCount ? Number(window.quantity) : 1;
            const unitCount = Number.isInteger(countValue) && countValue > 0 ? countValue : null;
            const sashCountValue = Array.isArray(sashCounts)
                ? sashCounts[index]
                : sashCounts[id];
            const sashCount = sashCountValue === undefined
                ? 1
                : Number(sashCountValue);
            const cuts = [];

            if (/door|sliding|shopfront/.test(productType)) {
                pending.push({
                    id,
                    reason: "This product type is outside the Casement 28 window takeoff; verify its system separately."
                });
                rows.push({ id, width, height, unitCount, sashCount, cuts, status: "Outside Casement 28 scope" });
                return;
            }

            if (unitCount === null) {
                pending.push({ id, reason: "Quantity must be a positive whole number." });
                rows.push({ id, width, height, unitCount, sashCount, cuts, status: "Invalid quantity" });
                return;
            }

            if (!width || !height) {
                pending.push({ id, reason: "Both opening dimensions are required." });
                rows.push({ id, width, height, unitCount, sashCount, cuts, status: "Missing dimensions" });
                return;
            }

            if (!Number.isInteger(sashCount) || sashCount < 0) {
                pending.push({ id, reason: "Choose a valid sash count before estimating this item." });
                rows.push({ id, width, height, unitCount, sashCount: null, cuts, status: "Sash count required" });
                return;
            }

            addCut(cuts, profileTotals, frameProfile, "Frame head / sill", width, 2 * unitCount);
            addCut(cuts, profileTotals, frameProfile, "Frame jamb", height, 2 * unitCount);
            cornerCleatQuantity += 4 * unitCount;

            if (sashCount === 1) {
                addCut(cuts, profileTotals, sashProfile, "Sash top / bottom", width, 2 * unitCount);
                addCut(cuts, profileTotals, sashProfile, "Sash stile", height, 2 * unitCount);
                cornerCleatQuantity += 4 * unitCount;
            } else if (sashCount > 1) {
                pending.push({
                    id,
                    reason: "Multiple sashes need individual sash sizes and mullion details; sash cuts are not estimated."
                });
                cornerCleatQuantity += 4 * unitCount * sashCount;
            }

            rows.push({
                id,
                width,
                height,
                unitCount,
                sashCount,
                cuts,
                status: sashCount > 1
                    ? "Frame estimated; sash layout required"
                    : "Provisional opening-size takeoff"
            });
        });

        return {
            rows,
            pending,
            profiles: Array.from(profileTotals.values()),
            components: cornerCleatQuantity
                ? [{ ...cornerCleat, quantity: cornerCleatQuantity }]
                : [],
            totalCutPieces: rows.reduce((total, row) =>
                total + row.cuts.reduce((rowTotal, cut) => rowTotal + cut.pieceCount, 0), 0),
            manualRevision: CASEMENT_28_MANUAL.revision
        };
    }

    function groupCasement28CutSchedule(rows) {
        const groups = new Map();

        (Array.isArray(rows) ? rows : []).forEach(row => {
            (Array.isArray(row?.cuts) ? row.cuts : []).forEach(cut => {
                const key = JSON.stringify([
                    cut.profileCode,
                    cut.member,
                    cut.cutLengthMm
                ]);
                let group = groups.get(key);

                if (!group) {
                    group = {
                        profileCode: cut.profileCode,
                        profileDescription: cut.profileDescription,
                        member: cut.member,
                        cutLengthMm: cut.cutLengthMm,
                        pieceCount: 0,
                        itemReferences: []
                    };
                    groups.set(key, group);
                }

                group.pieceCount += cut.pieceCount;
                const itemReference = group.itemReferences.find(item => item.id === row.id);
                if (itemReference) {
                    itemReference.pieceCount += cut.pieceCount;
                } else {
                    group.itemReferences.push({
                        id: row.id,
                        pieceCount: cut.pieceCount
                    });
                }
            });
        });

        return Array.from(groups.values());
    }

    function addCut(cuts, profileTotals, profile, member, cutLengthMm, pieceCount) {
        cuts.push({ profileCode: profile.code, profileDescription: profile.description, member, cutLengthMm, pieceCount });

        const total = profileTotals.get(profile.code) || {
            code: profile.code,
            description: profile.description,
            pieceCount: 0,
            totalLengthMm: 0
        };
        total.pieceCount += pieceCount;
        total.totalLengthMm += cutLengthMm * pieceCount;
        profileTotals.set(profile.code, total);
    }

    return Object.freeze({
        estimateProject,
        PALACE_MANUAL,
        estimatePalaceSillExtension,
        CASEMENT_28_MANUAL,
        estimateCasement28,
        groupCasement28CutSchedule
    });
}));

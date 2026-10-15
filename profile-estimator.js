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
        cornerCleatCode: "W52695",
        /*
         * The manual states opening sizes in red and the actual window sizes in
         * black in brackets. Every published pair (600/590, 900/890, 1200/1190,
         * 1500/1490, 1800/1790, 2400/2390) differs by 10 mm on each axis, so the
         * actual window is 10 mm smaller than the opening it fits.
         */
        openingToWindowDeductionMm: 10,
        // Closed-frame corners: the cleat is crimped, then every joint is sealed.
        cornerJoint: Object.freeze({
            code: "W52695",
            description: "Casement 28 corner cleat",
            jointType: "Crimped corner",
            cleatsPerCorner: 1,
            cornersPerClosedFrame: 4,
            sealant: "Wispeco-approved joint sealer",
            method: "Corner cleat crimped from inside (hand tool) or outside (hydraulic tool)",
            finPileBeforeCrimping: true,
            excludesGlazedAreas: true
        }),
        // Mullion / transom cross joints: milled end, screw-fixed, then sealed.
        crossJoint: Object.freeze({
            code: "STPPS630",
            description: "6 x 30 pan-head posi S/S screw",
            jointType: "Milled cross joint",
            mullionEndMilling: true,
            mullionMilledLocked: true,
            sealant: "Silicone sealant",
            crossConnector: "CC28 cross connector (PVC)",
            cottagePaneConnector: "CPC28 cottage pane cross connector 28 mm (black)",
            finPileBehindGlazingBar: false,
            note: "Mullion ends are milled to engage the mullion; fin pile must meet and must not run to the edge of the profile."
        })
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
        const openingDeduction = CASEMENT_28_MANUAL.openingToWindowDeductionMm;
        const rows = [];
        const pending = [];
        const profileTotals = new Map();
        let cornerCleatQuantity = 0;
        let frameCornerQuantity = 0;
        let sashCornerQuantity = 0;
        let crossJointQuantity = 0;

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

            /*
             * The opening dimension is the hole in the wall. The manual publishes
             * the actual window size 10 mm smaller, so the outer frame members are
             * cut to the reduced window size, not to the raw opening size.
             */
            const windowWidth = Math.max(0, width - openingDeduction);
            const windowHeight = Math.max(0, height - openingDeduction);

            addCut(cuts, profileTotals, frameProfile, "Frame head / sill", windowWidth, 2 * unitCount);
            addCut(cuts, profileTotals, frameProfile, "Frame jamb", windowHeight, 2 * unitCount);
            cornerCleatQuantity += 4 * unitCount;
            frameCornerQuantity += CASEMENT_28_MANUAL.cornerJoint.cornersPerClosedFrame * unitCount;

            if (sashCount === 1) {
                addCut(cuts, profileTotals, sashProfile, "Sash top / bottom", windowWidth, 2 * unitCount);
                addCut(cuts, profileTotals, sashProfile, "Sash stile", windowHeight, 2 * unitCount);
                cornerCleatQuantity += 4 * unitCount;
                sashCornerQuantity += CASEMENT_28_MANUAL.cornerJoint.cornersPerClosedFrame * unitCount;
            } else if (sashCount > 1) {
                pending.push({
                    id,
                    reason: "Multiple sashes need individual sash sizes and mullion details; sash cuts are not estimated."
                });
                cornerCleatQuantity += 4 * unitCount * sashCount;
                sashCornerQuantity += CASEMENT_28_MANUAL.cornerJoint.cornersPerClosedFrame * unitCount * sashCount;
                // One milled, screw-fixed and sealed cross joint per mullion between
                // adjacent sashes. The layout itself is still a design detail.
                crossJointQuantity += Math.max(0, sashCount - 1) * unitCount;
            }

            rows.push({
                id,
                width,
                height,
                windowWidth,
                windowHeight,
                openingDeductionMm: openingDeduction,
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
            joints: buildJointSchedule({
                frameCornerQuantity,
                sashCornerQuantity,
                crossJointQuantity
            }),
            totalCutPieces: rows.reduce((total, row) =>
                total + row.cuts.reduce((rowTotal, cut) => rowTotal + cut.pieceCount, 0), 0),
            manualRevision: CASEMENT_28_MANUAL.revision
        };
    }

    /*
     * Corner and joint provisions. The manual treats every frame and sash as a
     * closed rectangle (4 crimped corners each) and every mullion / transom
     * crossing as a milled, screw-fixed and sealed cross joint.
     */
    function buildJointSchedule(quantities = {}) {
        const frameCorners = Math.max(0, quantities.frameCornerQuantity || 0);
        const sashCorners = Math.max(0, quantities.sashCornerQuantity || 0);
        const crossJoints = Math.max(0, quantities.crossJointQuantity || 0);
        const { cornerJoint, crossJoint } = CASEMENT_28_MANUAL;
        const lines = [];

        if (frameCorners) {
            lines.push({
                id: "frame-corners",
                kind: "corner",
                member: "Outer frame corners",
                jointType: cornerJoint.jointType,
                quantity: frameCorners,
                code: cornerJoint.code,
                description: cornerJoint.description,
                sealant: cornerJoint.sealant,
                method: cornerJoint.method,
                note: "Fin pile fitted to the sash and frame before crimping, excluding areas to be glazed."
            });
        }

        if (sashCorners) {
            lines.push({
                id: "sash-corners",
                kind: "corner",
                member: "Sash corners",
                jointType: cornerJoint.jointType,
                quantity: sashCorners,
                code: cornerJoint.code,
                description: cornerJoint.description,
                sealant: cornerJoint.sealant,
                method: cornerJoint.method,
                note: "Fin pile fitted to the sash and frame before crimping, excluding areas to be glazed."
            });
        }

        if (crossJoints) {
            lines.push({
                id: "cross-joints",
                kind: "cross",
                member: "Mullion / transom cross joints",
                jointType: crossJoint.jointType,
                quantity: crossJoints,
                code: crossJoint.code,
                description: crossJoint.description,
                sealant: crossJoint.sealant,
                method: "Mullion ends milled to engage the mullion, then screw-fixed",
                note: crossJoint.note
            });
        }

        return {
            lines,
            frameCorners,
            sashCorners,
            crossJoints,
            totalCorners: frameCorners + sashCorners,
            totalJoints: frameCorners + sashCorners + crossJoints,
            corner: cornerJoint,
            cross: crossJoint,
            notCalculated: crossJoints === 0 && (frameCorners + sashCorners) === 0
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
        buildJointSchedule,
        groupCasement28CutSchedule
    });
}));

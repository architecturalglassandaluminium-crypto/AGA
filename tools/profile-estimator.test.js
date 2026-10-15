"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const estimator = require("../profile-estimator.js");
const worksheet = require("../casement28-worksheet.js");

test("estimates gross rectangular frame dimensions without claiming a stock cut plan", () => {
    const result = estimator.estimateProject({
        windows: [{ id: "W1", length: 1000, width: 1000 }]
    });

    assert.equal(result.rows[0].perimeter, 4000);
    assert.equal(result.grossPerimeterMm, 4000);
    assert.equal(result.memberDimensionCount, 4);
    assert.deepEqual(result.rows[0].cuts, [1000, 1000, 1000, 1000]);
    assert.equal(result.pending.length, 0);
});

test("uses an explicit captured height when present", () => {
    const result = estimator.estimateProject({
        windows: [{ id: "W2", length: 1200, width: 900, height: 800 }]
    });

    assert.equal(result.rows[0].width, 800);
    assert.equal(result.rows[0].perimeter, 4000);
    assert.deepEqual(result.rows[0].cuts, [1200, 1200, 800, 800]);
});

test("keeps long recorded dimensions and flags only missing dimensions", () => {
    const result = estimator.estimateProject({
        windows: [
            { id: "missing-width", length: 1200 },
            { id: "too-long", length: 6000, width: 1000 },
            { id: "valid", length: 1000, width: 1000 }
        ]
    });

    assert.equal(result.rows.length, 3);
    assert.equal(result.grossPerimeterMm, 18000);
    assert.equal(result.pending.length, 1);
    assert.match(result.pending[0].reason, /Both dimensions/);
    assert.equal(result.rows[1].cuts[0], 6000);
});

test("sums gross perimeter across openings", () => {
    const result = estimator.estimateProject({
        windows: [
            { id: "W1", length: 2000, width: 1000 },
            { id: "W2", length: 2000, width: 1000 }
        ]
    });

    assert.equal(result.grossPerimeterMm, 12000);
    assert.equal(result.memberDimensionCount, 8);
    assert.equal(result.rows.length, 2);
});

test("returns an empty estimate for projects without windows", () => {
    assert.deepEqual(estimator.estimateProject({ windows: [] }), {
        rows: [],
        pending: [],
        grossPerimeterMm: 0,
        memberDimensionCount: 0
    });
});

test("uses the Palace manual's end-cap allowance only for sill extensions", () => {
    const result = estimator.estimatePalaceSillExtension("1200");

    assert.deepEqual(result, {
        measuredDimensionMm: 1200,
        endCapAllowanceEachEndMm: 4,
        totalEndCapAllowanceMm: 8,
        cutLengthMm: 1192
    });
    assert.equal(estimator.estimatePalaceSillExtension(8), null);
    assert.equal(estimator.estimatePalaceSillExtension(""), null);
    assert.equal(estimator.estimateProject({
        windows: [{ id: "W1", length: 1200, width: 900 }]
    }).grossPerimeterMm, 4200);
});

test("publishes selected Palace profile references from the current manual revision", () => {
    assert.equal(estimator.PALACE_MANUAL.revision, "Rev. 9 (2025-02-26)");
    assert.ok(estimator.PALACE_MANUAL.profiles.some(profile =>
        profile.code === "W58916" && profile.description === "Palace Multi Sill Extension"
    ));
    assert.ok(Object.isFrozen(estimator.PALACE_MANUAL.profiles));
});

test("builds a provisional Casement 28 profile takeoff from opening dimensions", () => {
    const result = estimator.estimateCasement28({
        windows: [{ id: "C1", length: 1200, height: 900 }]
    });

    assert.equal(result.manualRevision, "October 2013");
    assert.deepEqual(result.profiles, [
        {
            code: "W52692",
            description: "Casement 28 equal-leg standard outer frame",
            pieceCount: 4,
            totalLengthMm: 4200
        },
        {
            code: "W52699",
            description: "Casement 28 standard sash",
            pieceCount: 4,
            totalLengthMm: 4200
        }
    ]);
    assert.deepEqual(result.components, [{
        code: "W52695",
        description: "Casement 28 corner cleat",
        quantity: 8
    }]);
    assert.equal(result.totalCutPieces, 8);
    assert.deepEqual(result.rows[0].cuts.map(cut => [cut.member, cut.cutLengthMm, cut.pieceCount]), [
        ["Frame head / sill", 1200, 2],
        ["Frame jamb", 900, 2],
        ["Sash top / bottom", 1200, 2],
        ["Sash stile", 900, 2]
    ]);
    assert.equal(result.pending.length, 0);
});

test("counts Casement 28 corners and cross joints from the manual assemblies", () => {
    const result = estimator.estimateCasement28({
        windows: [
            { id: "single", length: 1200, height: 900 },
            { id: "pair", length: 1800, height: 900, quantity: 2 }
        ]
    }, {
        sashCounts: [1, 2]
    });

    // Frame: 4 crimped corners per closed frame. 1 + 2 units = 12 corners.
    assert.equal(result.joints.frameCorners, 12);
    // Sash: 4 corners each. One 1-sash unit (4) + two 2-sash units (16) = 20.
    assert.equal(result.joints.sashCorners, 20);
    // One milled + sealed cross joint per mullion between adjacent sashes.
    assert.equal(result.joints.crossJoints, 2);
    assert.equal(result.joints.totalCorners, 32);
    assert.equal(result.joints.totalJoints, 34);

    const frameLine = result.joints.lines.find(line => line.id === "frame-corners");
    const sashLine = result.joints.lines.find(line => line.id === "sash-corners");
    const crossLine = result.joints.lines.find(line => line.id === "cross-joints");

    // Corners are crimped and sealed with an approved joint sealer.
    assert.equal(frameLine.jointType, "Crimped corner");
    assert.equal(frameLine.code, "W52695");
    assert.match(frameLine.sealant, /Wispeco-approved joint sealer/);
    assert.match(frameLine.method, /crimped/i);
    assert.match(frameLine.note, /Fin pile/);
    assert.equal(sashLine.quantity, 20);

    // Cross joints are milled, screw-fixed and sealed with silicone.
    assert.equal(crossLine.jointType, "Milled cross joint");
    assert.equal(crossLine.code, "STPPS630");
    assert.match(crossLine.sealant, /Silicone sealant/);
    assert.match(crossLine.method, /milled/i);
    assert.match(crossLine.note, /must not run to the edge of the profile/);
});

test("reports no joints when no closed frame is estimated", () => {
    const result = estimator.estimateCasement28({
        windows: [{ id: "door", productType: "Aluminium Door", length: 900, height: 2100 }]
    });

    assert.deepEqual(result.joints.lines, []);
    assert.equal(result.joints.totalJoints, 0);
    assert.equal(result.joints.notCalculated, true);

    const direct = estimator.buildJointSchedule();
    assert.deepEqual(direct.lines, []);
    assert.equal(direct.totalJoints, 0);
});

test("supports alternate Casement 28 frame profiles and fixed-light sash counts", () => {
    const result = estimator.estimateCasement28({
        windows: [{ id: "C2", length: 1500, height: 1000, quantity: 2 }]
    }, {
        frameProfileCode: "W52007",
        sashCounts: [0]
    });

    assert.deepEqual(result.profiles.map(profile => profile.code), ["W52007"]);
    assert.equal(result.profiles[0].pieceCount, 8);
    assert.equal(result.components[0].quantity, 8);
    assert.equal(result.rows[0].cuts.some(cut => cut.profileCode === "W52699"), false);
});

test("flags missing dimensions, multi-sash layouts and non-Casement products", () => {
    const result = estimator.estimateCasement28({
        windows: [
            { id: "missing", length: 1000 },
            { id: "multi", length: 1400, height: 1000 },
            { id: "door", productType: "Aluminium Door", length: 900, height: 2100 },
            { id: "invalid-quantity", length: 1200, height: 900, quantity: 1.5 }
        ]
    }, { sashCounts: [1, 2, 1, 1] });

    assert.equal(result.pending.length, 4);
    assert.match(result.pending[0].reason, /Both opening dimensions/);
    assert.match(result.pending[1].reason, /individual sash sizes and mullion details/);
    assert.match(result.pending[2].reason, /outside the Casement 28 window takeoff/);
    assert.match(result.pending[3].reason, /positive whole number/);
    assert.equal(result.rows[1].cuts.some(cut => cut.profileCode === "W52699"), false);
    assert.equal(result.rows[2].cuts.length, 0);
    assert.equal(result.rows[3].cuts.length, 0);
});

test("groups identical Casement 28 cuts while retaining per-item piece traceability", () => {
    const estimate = estimator.estimateCasement28({
        windows: [
            { id: "CW-01", length: 1000, height: 800, quantity: 1 },
            { id: "CW-02", length: 1000, height: 800, quantity: 2 }
        ]
    }, { sashCounts: [0, 0] });
    const schedule = estimator.groupCasement28CutSchedule(estimate.rows);
    const frameHead = schedule.find(cut =>
        cut.profileCode === "W52692" && cut.member === "Frame head / sill"
    );

    assert.equal(frameHead.cutLengthMm, 1000);
    assert.equal(frameHead.pieceCount, 6);
    assert.deepEqual(frameHead.itemReferences, [
        { id: "CW-01", pieceCount: 2 },
        { id: "CW-02", pieceCount: 4 }
    ]);
    assert.equal(schedule.filter(cut =>
        cut.profileCode === "W52692" && cut.member === "Frame head / sill"
    ).length, 1);
});

test("builds a traceable Casement 28 workshop worksheet with dimensioned diagrams and caveats", () => {
    const project = {
        id: "project-1",
        projectNumber: "AGA-1024",
        projectName: "North elevation",
        customerName: "A & B Customer",
        windows: [
            { id: "CW-01", productType: "Casement Window", location: "Kitchen", description: "North wall", length: 1200, height: 900, frameColour: "Charcoal" },
            { id: "CW-02", productType: "Casement Window", location: "Bedroom", length: 1500, height: 1000, frameColour: "White" }
        ]
    };
    const estimate = estimator.estimateCasement28(project, {
        frameProfileCode: "W52694",
        sashCounts: [1, 0]
    });
    const html = worksheet.buildWorksheetMarkup(project, estimate, {
        frameProfile: estimator.CASEMENT_28_MANUAL.profiles.find(profile => profile.code === "W52694"),
        dateLabel: "14 Oct 2026",
        idPrefix: "test",
        cutSchedule: estimator.groupCasement28CutSchedule(estimate.rows)
    });

    assert.match(html, /AGA-1024/);
    assert.match(html, /A &amp; B Customer/);
    assert.match(html, /North wall · Kitchen|Kitchen · North wall/);
    assert.match(html, /W52694 — Casement 28 unequal-leg standard outer frame/);
    assert.match(html, /PROVISIONAL/);
    assert.match(html, /CW-01 \(2 pcs\)/);
    assert.match(html, /CW-02 \(2 pcs\)/);
    assert.match(html, /Opening W: 1\s?200 mm/);
    assert.match(html, /Opening H: 900 mm/);
    assert.match(html, /Frame head/);
    assert.match(html, /Outer frame — unequal-leg/);
    assert.match(html, /unequal-leg FRAME PROFILE/);
    assert.match(html, /Single-sash opening reference only/);
    assert.match(html, /OPENING REFERENCE ONLY/);
    assert.match(html, /SASH SIZE \/ CUT NOT CALCULATED/);
    assert.match(html, /Single-sash values are unadjusted opening-size references only — not fabrication cuts or saw instructions/);
    assert.match(html, /actual sash size \/ cut not calculated/i);
    assert.match(html, /unadjusted opening-reference total only — not a fabrication cut or saw instruction/);
    assert.match(html, /Length meaning/);
    assert.match(html, /Opening-size reference only — actual sash size \/ cut not calculated; not a saw instruction/);
    assert.match(html, /AGA-1024 — North elevation/);
    assert.match(html, /PROVISIONAL — VERIFY WITH STARFRONT/);
    assert.match(html, /Fixed light: no sash members/);
    assert.match(html, /Cut lengths checked against StarFront/);
    assert.match(html, /All displayed lengths are unadjusted opening-size references — not approved fabrication cuts or saw instructions/);
    assert.match(html, /Total opening-reference length/);
    assert.doesNotMatch(html, /Single-sash raw values|Total raw length/);
    assert.match(html, /Worker initials \/ date/);
    assert.match(html, /Workshop notes/);
    // Corners and joints must be provisioned on the workshop sheet.
    assert.match(html, /Corners &amp; joints schedule/);
    assert.match(html, /Outer frame corners/);
    assert.match(html, /Sash corners/);
    assert.match(html, /Crimped corner/);
    assert.match(html, /W52695/);
    assert.match(html, /Wispeco-approved joint sealer/);
    assert.match(html, /Corner cleats fitted and crimped/);
    assert.match(html, /All joints sealed with approved sealer/);
    assert.match(html, /Joint sealer used \(approved\)/);
    assert.match(html, /Crimp tool checked/);
    assert.match(html, /All mechanical joints must be sealed with a Wispeco-approved joint sealer/);
    assert.match(html, /No deductions, end treatments or angles, mullion layout, stock bars, glass, beads, gaskets, hardware, saw kerf, waste, windload or sash-limit calculations/);
    assert.match(html, /StarFront's current design and cutting list remain controlling/);
    assert.doesNotMatch(html, /Palace/);

    const equalEstimate = estimator.estimateCasement28(project, {
        frameProfileCode: "W52692",
        sashCounts: [0, 0]
    });
    const equalHtml = worksheet.buildWorksheetMarkup(project, equalEstimate, {
        frameProfile: estimator.CASEMENT_28_MANUAL.profiles.find(profile => profile.code === "W52692"),
        idPrefix: "equal-frame",
        cutSchedule: estimator.groupCasement28CutSchedule(equalEstimate.rows)
    });
    assert.match(equalHtml, /equal-leg FRAME PROFILE/);
    assert.match(equalHtml, /Outer frame — equal-leg/);
    assert.doesNotMatch(equalHtml, /unequal-leg FRAME PROFILE/);
});

test("prints a cross-joint provision when a multi-sash layout needs one", () => {
    const project = {
        projectNumber: "AGA-2048",
        projectName: "Multi-sash elevation",
        windows: [{ id: "CW-10", productType: "Casement Window", length: 1800, height: 900, quantity: 2 }]
    };
    const estimate = estimator.estimateCasement28(project, { sashCounts: [2] });
    const html = worksheet.buildWorksheetMarkup(project, estimate, {
        frameProfile: estimator.CASEMENT_28_MANUAL.profiles[0],
        idPrefix: "cross",
        cutSchedule: estimator.groupCasement28CutSchedule(estimate.rows)
    });

    assert.match(html, /Mullion \/ transom cross joints/);
    assert.match(html, /Milled cross joint/);
    assert.match(html, /Silicone sealant/);
    assert.match(html, /STPPS630/);
    assert.match(html, /milled to engage the mullion/);
    assert.match(html, /must not run to the edge of the profile/);
    // 2 units -> 8 frame corners, 16 sash corners, 2 cross joints.
    assert.match(html, /<span>Cross joints<\/span><strong>2<\/strong>/);
    assert.match(html, /<span>Total joints<\/span><strong>26<\/strong>/);
});

test("does not draw Casement diagrams for unsupported products", () => {
    const project = {
        windows: [{ id: "DOOR-1", productType: "Aluminium Door", length: 900, height: 2100 }]
    };
    const estimate = estimator.estimateCasement28(project);
    const html = worksheet.buildWorksheetMarkup(project, estimate, {
        frameProfile: estimator.CASEMENT_28_MANUAL.profiles[0],
        cutSchedule: estimator.groupCasement28CutSchedule(estimate.rows)
    });

    assert.match(html, /Outside Casement 28 scope/);
    assert.match(html, /No Casement 28 takeoff is available/);
    assert.doesNotMatch(html, /Outer frame — equal-leg/);
    assert.doesNotMatch(html, /Standard sash/);
});

test("prints only the selected Casement 28 worksheet and keeps worksheet actions scoped", () => {
    const root = path.join(__dirname, "..");
    const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
    const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");

    assert.match(app, /function printCasement28Worksheet\(\)/);
    assert.match(app, /getProjects\(\)\.find\(item => String\(item\.id\) === String\(profileEstimatorProjectId\)\)/);
    assert.match(app, /onclick="printCasement28Worksheet\(\)"/);
    assert.match(app, /idPrefix: "c28-print"/);
    assert.match(app, /Opening-size reference only — actual sash size \/ cut not calculated; not a saw instruction/);
    assert.match(app, /Opening-size reference schedule — not a cut list/);
    assert.match(app, /<h4>Corners &amp; joints<\/h4>/);
    assert.match(app, /estimate\.joints\?\.lines/);
    assert.match(styles, /\.c28-joint-table th:nth-child\(6\)/);
    assert.match(styles, /\.c28-joint-totals\s*\{/);
    assert.match(app, /fixed-width A4 sheet/);
    assert.match(app, /tabindex="0" role="region" aria-label="Scrollable A4 workshop worksheet preview"/);
    assert.match(app, /swipe horizontally or focus the preview and use the arrow keys/);
    assert.match(html, /id="printCasement28Worksheet" class="print-only"/);
    assert.match(html, /<script src="profile-estimator\.js"><\/script>\s*<script src="casement28-worksheet\.js"><\/script>\s*<script src="app\.js"><\/script>/);
    assert.match(styles, /body\.printing-casement28:not\(\.printing-quote\):not\(\.printing-roof\):not\(\.print-label-active\) > #printCasement28Worksheet/);
    assert.match(styles, /body\.printing-casement28 #printWorksheet,\s*body\.printing-casement28 #quotePrintSheet/);
    assert.match(styles, /@page c28-worksheet[\s\S]*?@bottom-right[\s\S]*?content: "Page " counter\(page\)/);
    assert.doesNotMatch(styles, /counter\(pages\)/);
    assert.match(styles, /\.c28-running-header\s*\{[\s\S]*?position: fixed/);
    assert.match(styles, /\.c28-section\s*\{[\s\S]*?break-inside: auto/);
    assert.match(styles, /display: table-header-group/);
    assert.match(serviceWorker, /"\.\/casement28-worksheet\.js"/);
    assert.match(serviceWorker, /aga-shell-v28/);
});

test("includes captured dimensions and labels the generic estimate as not a cutting list", () => {
    const root = path.join(__dirname, "..");
    const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const email = fs.readFileSync(path.join(root, "email.js"), "utf8");
    const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");

    assert.match(app, /onclick="openProjectEstimator\(/);
    assert.match(app, /profileEstimatorProject\.addEventListener\("change"/);
    assert.match(app, /buildPalaceManualReferenceHtml\(\)/);
    assert.match(app, /estimatePalaceSillExtension\(event\.target\.value\)/);
    assert.match(app, /height: Number\(row\.width\)/);
    assert.match(app, /profileEstimate\.innerHTML = buildFrameDimensionEstimateHtml\(project, false\)/);
    assert.match(app, /buildFrameDimensionEstimateHtml\(project, true\)/);
    assert.match(app, /Generic frame dimensions — not a cutting list/);
    assert.match(app, /Verify every size and all material requirements against the current\s+StarFront design and cutting list/);
    assert.doesNotMatch(app, /6,000 mm stock bars/);
    assert.match(app, /profileEstimate\.hidden = true/);
    assert.match(html, /<script src="profile-estimator\.js"><\/script>\s*<script src="casement28-worksheet\.js"><\/script>\s*<script src="app\.js"><\/script>/);
    assert.match(html, /<th>Width \(mm\)<\/th>\s*<th>Height \(mm\)<\/th>/);
    assert.match(html, /Width and height in mm/);
    assert.match(html, /Casement 28 Material Estimate/);
    assert.match(html, /opening-size references — not fabrication cuts or saw instructions/i);
    assert.doesNotMatch(html, /provisional raw cuts|cut lengths use full opening dimensions/i);
    assert.match(html, /latest StarFront design and cutting list/);
    assert.match(app, /estimateCasement28\(currentProject/);
    assert.match(app, /Profile pieces referenced/);
    assert.doesNotMatch(app, /Profile cut pieces estimated/);
    assert.match(app, /casement28FrameProfile/);
    assert.match(app, /data-estimator-sash-row/);
    assert.match(app, /Opening-size reference schedule — not a cut list/);
    assert.match(html, /id="printProfileEstimate"/);
    assert.match(email, /worksheetFrameDimensionEstimate\(project\)/);
    assert.match(email, /Generic frame dimensions — not a cutting list/);
    assert.doesNotMatch(email, /estimated 6,000 mm stock bars/);
    assert.match(email, /<th>Width<\/th>\s*<th>Height<\/th>/);
    assert.match(serviceWorker, /"\.\/profile-estimator\.js"/);
});

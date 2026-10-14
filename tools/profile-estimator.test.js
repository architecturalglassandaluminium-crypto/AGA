"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const estimator = require("../profile-estimator.js");

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
    assert.match(app, /Requires StarFront/);
    assert.doesNotMatch(app, /6,000 mm stock bars/);
    assert.match(app, /profileEstimate\.hidden = true/);
    assert.match(html, /<script src="profile-estimator\.js"><\/script>\s*<script src="app\.js"><\/script>/);
    assert.match(html, /<th>Width \(mm\)<\/th>\s*<th>Height \(mm\)<\/th>/);
    assert.match(html, /Width and height in mm/);
    assert.match(html, /Palace references below/);
    assert.match(html, /id="printProfileEstimate"/);
    assert.match(email, /worksheetFrameDimensionEstimate\(project\)/);
    assert.match(email, /Generic frame dimensions — not a cutting list/);
    assert.doesNotMatch(email, /estimated 6,000 mm stock bars/);
    assert.match(email, /<th>Width<\/th>\s*<th>Height<\/th>/);
    assert.match(serviceWorker, /"\.\/profile-estimator\.js"/);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const estimator = require("../profile-estimator.js");

test("estimates a rectangular frame perimeter and one stock bar", () => {
    const result = estimator.estimateProject({
        windows: [{ id: "W1", length: 1000, width: 1000 }]
    });

    assert.equal(result.rows[0].perimeter, 4000);
    assert.deepEqual(result.rows[0].cuts, [1000, 1000, 1000, 1000]);
    assert.equal(result.totalCutLength, 4000);
    assert.equal(result.cutCount, 4);
    assert.equal(result.stockBars, 1);
    assert.equal(result.estimatedOffcut, 1988);
    assert.equal(result.pending.length, 0);
    assert.deepEqual(result.bars[0].cuts.map(cut => cut.member), [
        "Width 1",
        "Width 2",
        "Height 1",
        "Height 2"
    ]);
    assert.deepEqual(result.bars[0].cuts.map(cut => cut.itemId), ["W1", "W1", "W1", "W1"]);
});

test("uses an explicit captured height when present", () => {
    const result = estimator.estimateProject({
        windows: [{ id: "W2", length: 1200, width: 900, height: 800 }]
    });

    assert.equal(result.rows[0].width, 800);
    assert.equal(result.rows[0].perimeter, 4000);
    assert.deepEqual(result.rows[0].cuts, [1200, 1200, 800, 800]);
});

test("excludes openings with missing or overlength members from stock totals", () => {
    const result = estimator.estimateProject({
        windows: [
            { id: "missing-width", length: 1200 },
            { id: "too-long", length: 6000, width: 1000 },
            { id: "valid", length: 1000, width: 1000 }
        ]
    });

    assert.equal(result.rows.length, 3);
    assert.equal(result.stockBars, 1);
    assert.equal(result.totalCutLength, 4000);
    assert.equal(result.pending.length, 2);
    assert.match(result.pending[0].reason, /Both dimensions/);
    assert.match(result.pending[1].reason, /6,000 mm/);
    assert.equal(result.rows[1].overlength, true);
});

test("packs all valid cuts and accounts for saw kerf", () => {
    const result = estimator.estimateProject({
        windows: [
            { id: "W1", length: 2000, width: 1000 },
            { id: "W2", length: 2000, width: 1000 }
        ]
    });

    assert.equal(result.totalCutLength, 12000);
    assert.equal(result.cutCount, 8);
    assert.equal(result.stockBars, 3);
    assert.equal(result.stockLengthTotal, 18000);
    assert.equal(result.estimatedOffcut, 5976);
});

test("returns an empty estimate for projects without windows", () => {
    assert.deepEqual(estimator.estimateProject({ windows: [] }), {
        rows: [],
        pending: [],
        cutCount: 0,
        totalCutLength: 0,
        stockLength: 6000,
        stockBars: 0,
        stockLengthTotal: 0,
        estimatedOffcut: 0,
        bars: []
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
    }).totalCutLength, 4200);
});

test("publishes selected Palace profile references from the current manual revision", () => {
    assert.equal(estimator.PALACE_MANUAL.revision, "Rev. 9 (2025-02-26)");
    assert.ok(estimator.PALACE_MANUAL.profiles.some(profile =>
        profile.code === "W58916" && profile.description === "Palace Multi Sill Extension"
    ));
    assert.ok(Object.isFrozen(estimator.PALACE_MANUAL.profiles));
});

test("includes captured dimensions and a provisional cut list on project worksheets", () => {
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
    assert.match(app, /profileEstimate\.innerHTML = buildProfileCutListHtml\(project, false\)/);
    assert.match(app, /buildProfileCutListHtml\(project, true\)/);
    assert.match(app, /profileEstimate\.hidden = true/);
    assert.match(html, /<script src="profile-estimator\.js"><\/script>\s*<script src="app\.js"><\/script>/);
    assert.match(html, /<th>Width \(mm\)<\/th>\s*<th>Height \(mm\)<\/th>/);
    assert.match(html, /Width and height in mm/);
    assert.match(html, /documented\s+sill-extension allowance below/);
    assert.match(html, /id="printProfileEstimate"/);
    assert.match(email, /worksheetProfileCutList\(project\)/);
    assert.match(email, /<th>Width<\/th>\s*<th>Height<\/th>/);
    assert.match(serviceWorker, /"\.\/profile-estimator\.js"/);
});

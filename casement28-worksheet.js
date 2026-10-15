(function (root, factory) {
    const worksheet = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = worksheet;
    }

    root.Casement28Worksheet = worksheet;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        })[character]);
    }

    function dimension(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0
            ? `${parsed.toLocaleString("en-ZA", { maximumFractionDigits: 1 })} mm`
            : "Not recorded";
    }

    function sashLabel(count) {
        if (count === 0) return "Fixed light (no sash)";
        if (count === 1) return "One standard sash";
        return `${count} sashes — individual layout required`;
    }

    function check(label) {
        return `<span class="c28-check"><i aria-hidden="true"></i>${escapeHtml(label)}</span>`;
    }

    function dimensionedDiagram(title, profileCode, width, height, members, id, frameLegType = "") {
        const profileKey = frameLegType
            ? `<rect x="168" y="101" width="184" height="34" fill="#fff" stroke="#111" stroke-width="2"/>
                <text x="260" y="123" text-anchor="middle" font-size="14" font-weight="800">${escapeHtml(frameLegType)} FRAME PROFILE</text>`
            : "";
        return `<figure class="c28-diagram">
            <svg viewBox="0 0 520 270" role="img" aria-labelledby="${id}-title ${id}-desc">
                <title id="${id}-title">${escapeHtml(title)} — ${escapeHtml(profileCode)}</title>
                <desc id="${id}-desc">Schematic ${escapeHtml(title.toLowerCase())}${frameLegType ? ` with the selected ${escapeHtml(frameLegType)} frame profile called out` : ""} showing the opening width ${escapeHtml(width)} and height ${escapeHtml(height)}. Dimensions are unadjusted opening dimensions, not fabrication cuts.</desc>
                <defs>
                    <marker id="${id}-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
                        <path d="M0,0 L8,4 L0,8 Z" fill="#111"/>
                    </marker>
                </defs>
                <rect x="128" y="48" width="264" height="174" fill="none" stroke="#111" stroke-width="9"/>
                <line x1="128" y1="27" x2="392" y2="27" stroke="#111" stroke-width="1.5" marker-start="url(#${id}-arrow)" marker-end="url(#${id}-arrow)"/>
                <line x1="104" y1="48" x2="104" y2="222" stroke="#111" stroke-width="1.5" marker-start="url(#${id}-arrow)" marker-end="url(#${id}-arrow)"/>
                <text x="260" y="18" text-anchor="middle" font-size="16" font-weight="700">Opening W: ${escapeHtml(width)}</text>
                <text x="82" y="137" text-anchor="middle" font-size="16" font-weight="700" transform="rotate(-90 82 137)">Opening H: ${escapeHtml(height)}</text>
                <text x="260" y="68" text-anchor="middle" font-size="13" font-weight="700">${escapeHtml(members[0])}</text>
                <text x="260" y="214" text-anchor="middle" font-size="13" font-weight="700">${escapeHtml(members[1])}</text>
                <text x="146" y="139" text-anchor="middle" font-size="12" font-weight="700" transform="rotate(-90 146 139)">${escapeHtml(members[2])}</text>
                <text x="374" y="139" text-anchor="middle" font-size="12" font-weight="700" transform="rotate(90 374 139)">${escapeHtml(members[3])}</text>
                ${profileKey}
                <text x="260" y="250" text-anchor="middle" font-size="13">Opening layout schematic · Profile ${escapeHtml(profileCode)} · not to scale</text>
            </svg>
            <figcaption>${escapeHtml(title)} · Profile ${escapeHtml(profileCode)} · opening layout schematic only; not an extrusion cross-section or fabrication cut plan.</figcaption>
        </figure>`;
    }

    function sashOpeningReferenceDiagram(width, height, id) {
        return `<figure class="c28-diagram c28-sash-reference">
            <svg viewBox="0 0 520 270" role="img" aria-labelledby="${id}-title ${id}-desc">
                <title id="${id}-title">Single-sash opening reference only</title>
                <desc id="${id}-desc">Opening width ${escapeHtml(width)} and height ${escapeHtml(height)} are shown only as unadjusted references. Actual sash dimensions and fabrication cuts are not calculated.</desc>
                <defs>
                    <marker id="${id}-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
                        <path d="M0,0 L8,4 L0,8 Z" fill="#111"/>
                    </marker>
                </defs>
                <rect x="128" y="48" width="264" height="174" fill="none" stroke="#111" stroke-width="5"/>
                <line x1="128" y1="27" x2="392" y2="27" stroke="#111" stroke-width="1.5" marker-start="url(#${id}-arrow)" marker-end="url(#${id}-arrow)"/>
                <line x1="104" y1="48" x2="104" y2="222" stroke="#111" stroke-width="1.5" marker-start="url(#${id}-arrow)" marker-end="url(#${id}-arrow)"/>
                <text x="260" y="18" text-anchor="middle" font-size="16" font-weight="700">Opening W: ${escapeHtml(width)}</text>
                <text x="82" y="137" text-anchor="middle" font-size="16" font-weight="700" transform="rotate(-90 82 137)">Opening H: ${escapeHtml(height)}</text>
                <rect x="153" y="105" width="214" height="52" fill="#fff" stroke="#111" stroke-width="2"/>
                <text x="260" y="127" text-anchor="middle" font-size="14" font-weight="900">OPENING REFERENCE ONLY</text>
                <text x="260" y="146" text-anchor="middle" font-size="12" font-weight="800">SASH SIZE / CUT NOT CALCULATED</text>
                <text x="260" y="250" text-anchor="middle" font-size="13">Schematic only · not to scale · not a sash cut layout</text>
            </svg>
            <figcaption>Opening W × H are unadjusted references only. Actual sash dimensions and fabrication cuts are not calculated.</figcaption>
        </figure>`;
    }

    function buildWorksheetMarkup(project, estimate, options = {}) {
        const windows = Array.isArray(project?.windows) ? project.windows : [];
        const rows = Array.isArray(estimate?.rows) ? estimate.rows : [];
        const cutSchedule = Array.isArray(options.cutSchedule) ? options.cutSchedule : [];
        const frameProfile = options.frameProfile || {};
        const dateLabel = options.dateLabel || "";
        const profileTotals = Array.isArray(estimate?.profiles) ? estimate.profiles : [];
        const components = Array.isArray(estimate?.components) ? estimate.components : [];
        const joints = estimate?.joints || null;
        const jointLines = Array.isArray(joints?.lines) ? joints.lines : [];
        const openings = rows.map((row, index) => {
            const item = windows[index] || {};
            const id = row.id || item.windowNumber || item.id || `Item ${index + 1}`;
            const widthLabel = dimension(row.width);
            const heightLabel = dimension(row.height);
            const configuration = sashLabel(row.sashCount);
            const productType = item.productType || item.windowType || "Window";
            const locationDescription = [item.location, item.description]
                .filter(Boolean)
                .join(" · ") || "Not recorded";
            const frameProfileCode = frameProfile.code || "W52692";
            const frameLegType = /unequal/i.test(frameProfile.description || "")
                ? "unequal-leg"
                : /equal/i.test(frameProfile.description || "")
                    ? "equal-leg"
                    : "selected profile";
            const idPrefix = options.idPrefix || "c28";
            const hasFrameTakeoff = row.cuts.some(cut => cut.profileCode === frameProfileCode);
            const frameSvg = hasFrameTakeoff ? dimensionedDiagram(
                `Outer frame — ${frameLegType}`,
                frameProfileCode,
                widthLabel,
                heightLabel,
                ["Frame head", "Frame sill", "Frame jamb", "Frame jamb"],
                `${idPrefix}-frame-${index}`,
                frameLegType
            ) : "";
            const sashSvg = hasFrameTakeoff && row.sashCount === 1
                ? sashOpeningReferenceDiagram(
                    widthLabel,
                    heightLabel,
                    `${idPrefix}-sash-${index}`
                )
                : "";
            const sashNote = !hasFrameTakeoff
                ? `<p class="c28-sash-note">No Casement 28 takeoff is available for this opening. Resolve dimensions, quantity and system scope before review.</p>`
                : row.sashCount === 0
                ? `<p class="c28-sash-note">Fixed light: no sash members are included in the material schedule.</p>`
                : row.sashCount > 1
                    ? `<p class="c28-sash-note">Individual sash sizes and layout are required. No sash cuts are estimated.</p>`
                    : `<p class="c28-sash-note c28-sash-placeholder">Single-sash values are unadjusted opening-size references only — not fabrication cuts or saw instructions. Actual sash dimensions and cuts are not calculated.</p>`;

            return `<section class="c28-opening">
                <h3><span>${escapeHtml(id)}</span><small>${escapeHtml(productType)}</small></h3>
                <table class="c28-opening-facts">
                    <tbody>
                        <tr><th>Location / description</th><td>${escapeHtml(locationDescription)}</td><th>Quantity</th><td>${escapeHtml(row.unitCount ?? "Not valid")}</td></tr>
                        <tr><th>Opening width</th><td>${escapeHtml(widthLabel)}</td><th>Opening height</th><td>${escapeHtml(heightLabel)}</td></tr>
                        <tr><th>Outer frame</th><td>${escapeHtml(frameProfileCode)} — ${escapeHtml(frameProfile.description || "Selected Casement 28 frame")}</td><th>Sash configuration</th><td>${escapeHtml(configuration)}</td></tr>
                        <tr><th>Frame colour</th><td colspan="3">${escapeHtml(item.frameColour || "Not recorded")}</td></tr>
                        <tr><th>Estimate status</th><td colspan="3">${escapeHtml(row.status || "No estimate status")}</td></tr>
                    </tbody>
                </table>
                ${frameSvg || sashSvg ? `<div class="c28-diagrams">${frameSvg}${sashSvg}</div>` : ""}
                ${sashNote}
                <div class="c28-checks" aria-label="Workshop checks">
                    ${check("Opening size verified")}
                    ${check("Cut lengths checked against StarFront")}
                    ${check("Corner cleats fitted and crimped")}
                    ${check("All joints sealed with approved sealer")}
                    ${check("Frame assembled / square")}
                    ${check("Glazing and hardware checked")}
                </div>
                <div class="c28-field-line"><span>Worker initials / date</span><i></i><span>Checker initials / date</span><i></i></div>
            </section>`;
        }).join("");
        const profileRows = profileTotals.map(profile => {
            const isSash = /sash/i.test(profile.description || "");
            return `
            <tr><td>${escapeHtml(profile.code)}</td><td>${escapeHtml(profile.description)}</td>
                <td class="c28-number">${escapeHtml(profile.pieceCount)} pcs</td>
                <td class="c28-number">${escapeHtml((profile.totalLengthMm / 1000).toLocaleString("en-ZA", { maximumFractionDigits: 1 }))} m ${isSash ? "unadjusted opening-reference total only — not a fabrication cut or saw instruction" : "gross unadjusted opening-reference length — not a fabrication cut or saw instruction"}</td></tr>`;
        }).join("");
        const componentRows = components.map(component => `
            <tr><td>${escapeHtml(component.code)}</td><td>${escapeHtml(component.description)}</td>
                <td class="c28-number">${escapeHtml(component.quantity)} pcs (estimated)</td></tr>`).join("");
        const jointRows = jointLines.map(line => {
            const isCorner = line.kind === "corner";
            const codeCell = code => `<code>${escapeHtml(code)}</code>`;
            const connector = isCorner
                ? codeCell(line.code)
                : codeCell(joints.cross.crossConnector.split(" (")[0]);
            const sealant = escapeHtml(line.sealant);
            return `<tr>
                <td><strong>${escapeHtml(line.member)}</strong><br><small>${escapeHtml(line.jointType)}</small></td>
                <td class="c28-number">${escapeHtml(line.quantity)}</td>
                <td>${escapeHtml(line.code)}<br><small>${escapeHtml(line.description)}</small></td>
                <td>${connector}<br><small>${escapeHtml(line.method)}</small></td>
                <td>${sealant}</td>
                <td>${escapeHtml(line.note || "")}</td>
            </tr>`;
        }).join("");
        const jointTotals = joints && joints.totalJoints
            ? joints
            : { frameCorners: 0, sashCorners: 0, crossJoints: 0, totalCorners: 0, totalJoints: 0 };
        const scheduleRows = cutSchedule.map(cut => {
            const references = (cut.itemReferences || [])
                .map(item => `${escapeHtml(item.id)} (${escapeHtml(item.pieceCount)} pcs)`)
                .join(", ");
            const isSash = /^sash\b/i.test(cut.member || "") || /sash/i.test(cut.profileDescription || "");
            return `<tr><td>${escapeHtml(cut.profileCode)}<br><small>${escapeHtml(cut.profileDescription)}</small></td>
                <td>${escapeHtml(cut.member)}</td><td class="c28-number">${escapeHtml(dimension(cut.cutLengthMm))}</td>
                <td class="c28-number">${escapeHtml(cut.pieceCount)}</td><td>${references}</td>
                <td>${isSash ? "Opening-size reference only — actual sash size / cut not calculated; not a saw instruction" : "Unadjusted opening-size reference — not a fabrication cut or saw instruction"}</td></tr>`;
        }).join("");
        const frameColours = [...new Set(windows.map(item => item.frameColour).filter(Boolean))].join(", ") || "Not recorded";
        const projectNumber = project?.projectNumber || "Not recorded";
        const projectName = project?.projectName || "Not recorded";

        return `<article class="casement28-worksheet">
            <header class="c28-header">
                <div><div class="c28-brand">AGA</div><p>Architectural Glass &amp; Aluminium · Workshop worksheet</p></div>
                <div class="c28-status">PROVISIONAL<br><span>VERIFY WITH STARFRONT</span></div>
            </header>
            <div class="c28-project-meta">
                <div><span>Project number</span><strong>${escapeHtml(project?.projectNumber || "Not recorded")}</strong></div>
                <div><span>Project name</span><strong>${escapeHtml(project?.projectName || "Not recorded")}</strong></div>
                <div><span>Customer</span><strong>${escapeHtml(project?.customerName || "Not recorded")}</strong></div>
                <div><span>Prepared</span><strong>${escapeHtml(dateLabel || "Not recorded")}</strong></div>
                <div><span>Frame colour(s)</span><strong>${escapeHtml(frameColours)}</strong></div>
            </div>
            <div class="c28-running-header">
                <strong>${escapeHtml(projectNumber)} — ${escapeHtml(projectName)}</strong>
                <span>PROVISIONAL — VERIFY WITH STARFRONT</span>
            </div>
            <p class="c28-top-caveat">2013 Casement 28 reference only. All displayed lengths are unadjusted opening-size references — not approved fabrication cuts or saw instructions. Sash sizes and cuts are not calculated.</p>
            <section class="c28-section">
                <h2>Profile-wise opening-size reference schedule</h2>
                <p>Identical profile / member / length lines are grouped; item references retain opening traceability. Every displayed length is an unadjusted opening-size reference, not an approved fabrication cut or saw instruction.</p>
                ${scheduleRows
                    ? `<table class="c28-table c28-cut-table"><thead><tr><th>Profile</th><th>Member</th><th>Opening reference (mm)</th><th>Total pieces</th><th>Item reference(s)</th><th>Length meaning</th></tr></thead><tbody>${scheduleRows}</tbody></table>`
                    : `<p class="c28-empty">No supported, dimensioned profile references are available for this project.</p>`}
            </section>
            <section class="c28-section">
                <h2>Materials summary — identified items only</h2>
                ${profileRows
                    ? `<table class="c28-table"><thead><tr><th>Profile</th><th>Description</th><th>Pieces</th><th>Total opening-reference length</th></tr></thead><tbody>${profileRows}</tbody></table>`
                    : `<p class="c28-empty">No profile quantities estimated.</p>`}
                ${componentRows
                    ? `<table class="c28-table c28-components"><thead><tr><th>Code</th><th>Component</th><th>Quantity</th></tr></thead><tbody>${componentRows}</tbody></table>`
                    : ""}
                <p class="c28-small">This summary includes only estimated outer-frame / standard-sash profiles and corner cleats. Other materials are not calculated.</p>
            </section>
            <section class="c28-section">
                <h2>Corners &amp; joints schedule</h2>
                ${jointRows
                    ? `<table class="c28-table c28-joint-table"><thead><tr><th>Joint</th><th>Qty</th><th>Cleat / fixing</th><th>Connector &amp; method</th><th>Sealant</th><th>Notes</th></tr></thead><tbody>${jointRows}</tbody></table>
                    <div class="c28-joint-totals">
                        <div><span>Outer frame corners</span><strong>${escapeHtml(jointTotals.frameCorners)}</strong></div>
                        <div><span>Sash corners</span><strong>${escapeHtml(jointTotals.sashCorners)}</strong></div>
                        <div><span>Cross joints</span><strong>${escapeHtml(jointTotals.crossJoints)}</strong></div>
                        <div><span>Total joints</span><strong>${escapeHtml(jointTotals.totalJoints)}</strong></div>
                    </div>
                    <p class="c28-small">Corner cleats (${escapeHtml(joints?.corner?.code || "W52695")}) are crimped, then every joint is sealed. Mullion / transom cross joints are milled to engage the mullion, screw-fixed and sealed with silicone. Counts are derived from the number of closed frames and sashes; the cross-joint count assumes one mullion between adjacent sashes.</p>`
                    : `<p class="c28-empty">No corners or joints are estimated for this project.</p>`}
            </section>
            <section class="c28-section">
                <h2>Opening details &amp; workshop checks</h2>
                ${openings || `<p class="c28-empty">No openings recorded for this project.</p>`}
            </section>
            <section class="c28-section c28-notes">
                <h2>Workshop notes</h2><div></div><div></div>
            </section>
            <section class="c28-signoff">
                <h2>Workshop sign-off</h2>
                <div><span>Fabricator</span><i></i><span>Date</span><i></i></div>
                <div><span>Checker</span><i></i><span>Date</span><i></i></div>
                <div><span>StarFront drawing / cut-list reference</span><i></i></div>
                <div><span>Joint sealer used (approved)</span><i></i><span>Crimp tool checked</span><i></i></div>
            </section>
            <footer class="c28-footer">
                <strong>Shop-floor caveat</strong>
                <p>Based on the available October 2013 Casement 28 reference, all lengths shown are unadjusted opening-size references only—not fabrication cuts or saw instructions. Single-sash values repeat the opening W × H for reference; actual sash dimensions and cuts are not calculated. Corner cleats and cross joints are counted from the number of closed frames and sashes; the cross-joint count assumes one mullion between adjacent sashes and does not design the mullion layout. All mechanical joints must be sealed with a Wispeco-approved joint sealer. Fin pile must be fitted before crimping, excluding areas to be glazed. No deductions, end treatments or angles, mullion layout, stock bars, glass, beads, gaskets, hardware, saw kerf, waste, windload or sash-limit calculations are provided. StarFront's current design and cutting list remain controlling. Confirm all fabrication details before cutting.</p>
            </footer>
        </article>`;
    }

    return Object.freeze({ buildWorksheetMarkup });
}));

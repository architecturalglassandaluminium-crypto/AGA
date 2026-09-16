/* =========================================================
   AGA ARCHITECTURAL GLASS & ALUMINIUM
   Customer Production Email System
   ========================================================= */

"use strict";

const EMAIL_COMPANY = {
    name: "AGA Architectural Glass & Aluminium",
    email: "info@agasouthafrica.co.za",
    phone: "010 597 6616"
};

const EMAIL_ENDPOINT = "/api/send-production-email";

/*
   The office addresses that are copied on internal notifications:
   every window moving into production, and every new project saved.
*/
const OFFICE_RECIPIENTS = [
    "tiffany@agasouthafrica.co.za",
    "jan@agasouthafrica.co.za"
];

/*
   IMPORTANT:
   A browser cannot hold an SMTP password or secret API key.
   The function below POSTs to your backend endpoint
   (/api/send-production-email) when one is deployed, e.g. a
   small serverless function that sends via your mail provider.

   When the app runs as a static site (GitHub Pages / local)
   there is no backend, so the email is gracefully skipped and
   the update still succeeds.
*/

/*
   Send one message through the backend endpoint.

   Returns true when it was accepted, false when there is no
   backend or it failed. Callers treat a false as "not sent" and
   must never block workshop work on it - email is best effort.
*/
async function postEmail({ to, subject, html, replyTo, attachments }) {

    try {

        /*
           Attachments are optional. Only a non-empty list is sent,
           so the existing callers that carry none are unchanged.
        */
        const payload = { to, subject, html, replyTo };

        if (Array.isArray(attachments) && attachments.length) {
            payload.attachments = attachments;
        }

        const response = await fetch(EMAIL_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.warn(
                `Email endpoint returned ${response.status}; work is still saved.`
            );
            return false;
        }

        const result = await response.json();

        if (!result.success) {
            console.warn(
                result.message || "Email could not be sent; work is still saved."
            );
            return false;
        }

        return true;

    } catch (error) {

        /*
           A missing / unreachable backend must NOT block the
           workshop from updating a status or saving a project.
        */
        console.warn("Email skipped (no backend available):", error.message);
        return false;
    }
}

async function sendProductionEmail(windowItem, status) {

    if (!windowItem) {
        console.error("No window information supplied.");
        return false;
    }

    const customerEmail = windowItem.customerEmail
        || windowItem.project?.customerEmail;

    if (!customerEmail) {
        return false;
    }

    if (!status) {
        status = windowItem.status || "Updated";
    }

    const sent = await postEmail({
        to: customerEmail,
        subject: getProductionEmailSubject(status),
        html: createProductionEmailHtml(windowItem, status),
        replyTo: EMAIL_COMPANY.email
    });

    if (sent) {
        console.log("Production email sent successfully.");
    }

    return sent;
}

/* =========================================================
   OFFICE NOTIFICATIONS
   ---------------------------------------------------------
   The office (Tiffany and Jan) is told about the two events
   they care about:

     * a window moving INTO PRODUCTION
     * a NEW PROJECT being saved
   These go to the office list only - never to a customer - and
   are best effort: a mailer that is down never stops a status
   change or a project save.
   ========================================================= */

/*
   Notify the office that a window has gone into production.
*/
async function sendProductionStartEmail(windowItem, employeeName) {

    if (!windowItem) {
        return false;
    }

    const subject =
        `Window into production: ${windowItem.windowNumber || windowItem.id}` +
        (windowItem.projectName ? ` \u2014 ${windowItem.projectName}` : "");

    return postEmail({
        to: OFFICE_RECIPIENTS,
        subject,
        html: createProductionStartEmailHtml(windowItem, employeeName),
        replyTo: EMAIL_COMPANY.email
    });
}

/*
   Notify the office that a new project has been saved.

   `attachments` is optional and defaults to none, so the automatic
   notification on a project save behaves exactly as before. Only the
   Email button passes a worksheet, because mailing an attachment on
   every edit would be noise.
*/
async function sendNewProjectEmail(project, employeeName, attachments = []) {

    if (!project) {
        return false;
    }

    const subject =
        `New project saved: ${project.projectNumber}` +
        (project.projectName ? ` \u2014 ${project.projectName}` : "");

    return postEmail({
        to: OFFICE_RECIPIENTS,
        subject,
        html: createNewProjectEmailHtml(project, employeeName),
        replyTo: project.customerEmail || EMAIL_COMPANY.email,
        attachments
    });
}

/* =========================================================
   EMAIL SUBJECT
   ========================================================= */

function getProductionEmailSubject(status) {

    const subjects = {
        "Measured": "Your AGA Window Measurements Have Been Recorded",
        "In Production": "Your AGA Window Order Is Now in Production",
        "Frame Manufactured": "Your AGA Window Frame Has Been Manufactured",
        "Glazed": "Your AGA Window Has Been Glazed",
        "Quality Checked": "Your AGA Window Has Passed Quality Check",
        "Ready for Installation": "Your AGA Window Is Ready for Installation",
        "Installed": "Your AGA Window Has Been Installed",
        "Completed": "Your AGA Window Order Has Been Completed"
    };

    return subjects[status] || `Update on Your AGA Window Order`;
}

/* =========================================================
   CREATE EMAIL HTML
   ========================================================= */

function createProductionEmailHtml(windowItem, status) {

    const customerName = escapeEmailHtml(windowItem.customerName || "Customer");
    const projectName = escapeEmailHtml(windowItem.projectName || "");
    const windowNumber = escapeEmailHtml(windowItem.windowNumber || windowItem.id || "");
    const location = escapeEmailHtml(windowItem.windowLocation || "");
    const windowType = escapeEmailHtml(windowItem.windowType || "");
    const frameColour = escapeEmailHtml(
        windowItem.customFrameColour || windowItem.frameColour || ""
    );
    const glass = escapeEmailHtml(windowItem.glassType || "");
    const manufacturer = escapeEmailHtml(
        windowItem.manufacturedBy || windowItem.checkedBy || "Workshop"
    );
    const formattedStatus = escapeEmailHtml(status);

    const width = windowItem.finalWidth || windowItem.width || "-";
    const height = windowItem.finalHeight || windowItem.height || "-";

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AGA Production Update</title>
    </head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#222;">

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
            style="background:#f3f4f6;padding:30px 10px;">
            <tr>
                <td align="center">

                    <table width="600" cellpadding="0" cellspacing="0" border="0"
                        style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

                        <!-- HEADER -->
                        <tr>
                            <td style="background:#111827;padding:25px;text-align:center;">
                                <h1 style="margin:0;color:#ffffff;font-size:24px;">${EMAIL_COMPANY.name}</h1>
                                <p style="margin:8px 0 0;color:#d1d5db;font-size:14px;">
                                    Architectural Glass &amp; Aluminium
                                </p>
                            </td>
                        </tr>

                        <!-- CONTENT -->
                        <tr>
                            <td style="padding:30px;">

                                <h2 style="margin-top:0;font-size:21px;color:#111827;">Production Update</h2>

                                <p style="font-size:16px;line-height:1.6;">Dear ${customerName},</p>

                                <p style="font-size:16px;line-height:1.6;">
                                    We are pleased to provide you with an update regarding your
                                    architectural glass and aluminium order.
                                </p>

                                <!-- STATUS -->
                                <table width="100%" cellpadding="0" cellspacing="0"
                                    style="margin:25px 0;border:1px solid #e5e7eb;border-radius:6px;">
                                    <tr>
                                        <td style="padding:20px;text-align:center;">
                                            <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;color:#6b7280;letter-spacing:1px;">
                                                Current Status
                                            </p>
                                            <p style="margin:0;font-size:22px;font-weight:bold;color:#111827;">
                                                ${formattedStatus}
                                            </p>
                                        </td>
                                    </tr>
                                </table>

                                <!-- DETAILS -->
                                <table width="100%" cellpadding="8" cellspacing="0"
                                    style="font-size:14px;border-collapse:collapse;">

                                    <tr>
                                        <td style="border-bottom:1px solid #eeeeee;font-weight:bold;width:40%;">Order Number</td>
                                        <td style="border-bottom:1px solid #eeeeee;">${windowNumber}</td>
                                    </tr>

                                    <tr>
                                        <td style="border-bottom:1px solid #eeeeee;font-weight:bold;width:40%;">Project</td>
                                        <td style="border-bottom:1px solid #eeeeee;">${projectName || "-"}</td>
                                    </tr>

                                    <tr>
                                        <td style="border-bottom:1px solid #eeeeee;font-weight:bold;width:40%;">Location</td>
                                        <td style="border-bottom:1px solid #eeeeee;">${location || "-"}</td>
                                    </tr>

                                    <tr>
                                        <td style="border-bottom:1px solid #eeeeee;font-weight:bold;width:40%;">Type</td>
                                        <td style="border-bottom:1px solid #eeeeee;">${windowType || "-"}</td>
                                    </tr>

                                    <tr>
                                        <td style="border-bottom:1px solid #eeeeee;font-weight:bold;width:40%;">Size</td>
                                        <td style="border-bottom:1px solid #eeeeee;">${width} × ${height} mm</td>
                                    </tr>

                                    <tr>
                                        <td style="border-bottom:1px solid #eeeeee;font-weight:bold;width:40%;">Frame Colour</td>
                                        <td style="border-bottom:1px solid #eeeeee;">${frameColour || "-"}</td>
                                    </tr>

                                    <tr>
                                        <td style="border-bottom:1px solid #eeeeee;font-weight:bold;width:40%;">Glass</td>
                                        <td style="border-bottom:1px solid #eeeeee;">${glass || "-"}</td>
                                    </tr>

                                    <tr>
                                        <td style="font-weight:bold;">Workshop</td>
                                        <td>${manufacturer}</td>
                                    </tr>

                                </table>

                                <p style="margin-top:25px;font-size:15px;line-height:1.6;">
                                    We will continue to update you as your item progresses
                                    through the manufacturing process.
                                </p>

                                <p style="font-size:15px;line-height:1.6;">
                                    If you have any questions regarding your order, please contact
                                    us using the details below.
                                </p>

                            </td>
                        </tr>

                        <!-- FOOTER -->
                        <tr>
                            <td style="background:#f9fafb;padding:25px;text-align:center;border-top:1px solid #e5e7eb;">
                                <p style="margin:0 0 8px;font-weight:bold;">${EMAIL_COMPANY.name}</p>
                                <p style="margin:4px 0;font-size:14px;">${EMAIL_COMPANY.phone}</p>
                                <p style="margin:4px 0;font-size:14px;">${EMAIL_COMPANY.email}</p>
                                <p style="margin:15px 0 0;font-size:12px;color:#6b7280;">
                                    This is an automated production update.
                                    Please do not reply directly to this email.
                                </p>
                            </td>
                        </tr>

                    </table>

                </td>
            </tr>
        </table>

    </body>
    </html>
    `;
}

/* =========================================================
   OFFICE EMAIL HTML
   ---------------------------------------------------------
   Two internal notifications. They are plain and factual: a
   heading, a line that says what happened, and a small table of
   the details the office needs to act on.
   ========================================================= */

/* A reusable row for the detail tables below. */
function emailDetailRow(label, value) {
    return `
        <tr>
            <td style="border-bottom:1px solid #eeeeee;font-weight:bold;width:40%;padding:8px;">${label}</td>
            <td style="border-bottom:1px solid #eeeeee;padding:8px;">${value || "-"}</td>
        </tr>`;
}

/*
   "A window has gone into production" - sent to the office.
*/
function createProductionStartEmailHtml(windowItem, employeeName) {

    const projectName = escapeEmailHtml(windowItem.projectName || "");
    const customerName = escapeEmailHtml(windowItem.customerName || "");
    const windowNumber = escapeEmailHtml(windowItem.windowNumber || windowItem.id || "");
    const location = escapeEmailHtml(windowItem.location || windowItem.windowLocation || "");
    const productType = escapeEmailHtml(windowItem.productType || windowItem.windowType || "");
    const description = escapeEmailHtml(windowItem.description || "");
    const frameColour = escapeEmailHtml(
        windowItem.frameColour || windowItem.customFrameColour || ""
    );
    const glass = escapeEmailHtml(windowItem.glassType || "");
    const size = escapeEmailHtml(
        windowItem.length || windowItem.width
            ? `${windowItem.length || "-"} \u00d7 ${windowItem.width || "-"} mm`
            : ""
    );
    const who = escapeEmailHtml(employeeName || "");

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Window into production</title>
    </head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:30px 10px;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" border="0"
                        style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
                        <tr>
                            <td style="background:#111827;padding:25px;text-align:center;">
                                <h1 style="margin:0;color:#ffffff;font-size:22px;">${EMAIL_COMPANY.name}</h1>
                                <p style="margin:8px 0 0;color:#d1d5db;font-size:14px;">Window in Production</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:30px;">
                                <h2 style="margin-top:0;font-size:20px;color:#111827;">Window moved into production</h2>
                                <p style="font-size:15px;line-height:1.6;">
                                    A window has moved to <strong>In Production</strong> in the AGA workshop.
                                </p>
                                <table width="100%" cellpadding="0" cellspacing="0"
                                    style="margin:20px 0;font-size:14px;border-collapse:collapse;">
                                    ${emailDetailRow("Window ID", windowNumber)}
                                    ${emailDetailRow("Project", projectName)}
                                    ${emailDetailRow("Customer", customerName)}
                                    ${emailDetailRow("Description", description)}
                                    ${emailDetailRow("Location", location)}
                                    ${emailDetailRow("Type", productType)}
                                    ${emailDetailRow("Size", size)}
                                    ${emailDetailRow("Frame Colour", frameColour)}
                                    ${emailDetailRow("Glass", glass)}
                                    ${emailDetailRow("Recorded by", who)}
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
                                <p style="margin:0;font-size:12px;color:#6b7280;">
                                    Automated message from the AGA Workshop system.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}

/*
   "A new project has been saved" - sent to the office.
*/
function createNewProjectEmailHtml(project, employeeName) {

    const projectNumber = escapeEmailHtml(project.projectNumber || "");
    const projectName = escapeEmailHtml(project.projectName || "");
    const customerName = escapeEmailHtml(project.customerName || "");
    const customerEmail = escapeEmailHtml(project.customerEmail || "");
    const customerPhone = escapeEmailHtml(project.customerPhone || "");
    const siteAddress = escapeEmailHtml(project.siteAddress || "");
    const who = escapeEmailHtml(employeeName || "");

    const windows = Array.isArray(project.windows) ? project.windows : [];

    const rows = windows.length
        ? windows.map(window => {

            const number = escapeEmailHtml(window.windowNumber || window.id || "");
            const description = escapeEmailHtml(window.description || "");
            const location = escapeEmailHtml(window.location || "");
            const size = escapeEmailHtml(
                window.length || window.width
                    ? `${window.length || "-"} \u00d7 ${window.width || "-"} mm`
                    : ""
            );
            const frame = escapeEmailHtml(window.frameColour || "");

            return `
                <tr>
                    <td style="border-bottom:1px solid #eeeeee;padding:6px;font-size:13px;">${number}</td>
                    <td style="border-bottom:1px solid #eeeeee;padding:6px;font-size:13px;">${description}</td>
                    <td style="border-bottom:1px solid #eeeeee;padding:6px;font-size:13px;">${location}</td>
                    <td style="border-bottom:1px solid #eeeeee;padding:6px;font-size:13px;">${size}</td>
                    <td style="border-bottom:1px solid #eeeeee;padding:6px;font-size:13px;">${frame}</td>
                </tr>`;
        }).join("")
        : `
                <tr>
                    <td colspan="5" style="padding:10px;font-size:13px;color:#6b7280;">
                        No windows captured on this project.
                    </td>
                </tr>`;

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New project saved</title>
    </head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#222;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:30px 10px;">
            <tr>
                <td align="center">
                    <table width="720" cellpadding="0" cellspacing="0" border="0"
                        style="max-width:720px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
                        <tr>
                            <td style="background:#111827;padding:25px;text-align:center;">
                                <h1 style="margin:0;color:#ffffff;font-size:22px;">${EMAIL_COMPANY.name}</h1>
                                <p style="margin:8px 0 0;color:#d1d5db;font-size:14px;">New Project Saved</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:30px;">
                                <h2 style="margin-top:0;font-size:20px;color:#111827;">New project saved</h2>
                                <p style="font-size:15px;line-height:1.6;">
                                    A new project has been created in the AGA Workshop system with
                                    <strong>${windows.length}</strong> window${windows.length === 1 ? "" : "s"}.
                                </p>
                                <table width="100%" cellpadding="0" cellspacing="0"
                                    style="margin:20px 0;font-size:14px;border-collapse:collapse;">
                                    ${emailDetailRow("Project Number", projectNumber)}
                                    ${emailDetailRow("Project Name", projectName)}
                                    ${emailDetailRow("Customer", customerName)}
                                    ${emailDetailRow("Customer Email", customerEmail)}
                                    ${emailDetailRow("Customer Phone", customerPhone)}
                                    ${emailDetailRow("Site Address", siteAddress)}
                                    ${emailDetailRow("Saved by", who)}
                                </table>
                                <h3 style="font-size:15px;color:#111827;">Windows in this project</h3>
                                <table width="100%" cellpadding="0" cellspacing="0"
                                    style="font-size:13px;border-collapse:collapse;">
                                    <tr>
                                        <th align="left" style="border-bottom:2px solid #111827;padding:6px;">Window</th>
                                        <th align="left" style="border-bottom:2px solid #111827;padding:6px;">Description</th>
                                        <th align="left" style="border-bottom:2px solid #111827;padding:6px;">Location</th>
                                        <th align="left" style="border-bottom:2px solid #111827;padding:6px;">Size</th>
                                        <th align="left" style="border-bottom:2px solid #111827;padding:6px;">Frame</th>
                                    </tr>
                                    ${rows}
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
                                <p style="margin:0;font-size:12px;color:#6b7280;">
                                    Automated message from the AGA Workshop system.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}

/* =========================================================
   PROJECT WORKSHEET DOCUMENT
   ---------------------------------------------------------
   The same schedule the workshop prints, as a standalone HTML
   file that can be attached to an email.

   It is built from the same project record and the same field
   rules as printProject() in app.js, so the sheet the office
   receives matches the sheet the bench prints. It is assembled
   here as a string, rather than read out of the page, so an
   attachment never depends on which screen the user is on.

   It carries its own print styles because a file opened from an
   inbox has none of the app's stylesheet. A4 landscape with a
   repeating table header is what makes it read as a worksheet
   rather than a web page.
   ========================================================= */

/* Sizes print as a bare number; a missing one must not say "undefined". */
function worksheetSize(value) {

    const text = String(value ?? "").trim();

    return text || "\u2014";
}

/*
   One row per window, in the same column order as the printed
   schedule. Every cell is escaped, so a description containing
   an angle bracket cannot break the document.

   `showPhotos` adds the photo column and must match the header row
   built by createProjectWorksheetHtml - a mismatch would misalign
   every cell in the schedule.
*/
function worksheetScheduleRows(windows, showPhotos) {

    if (!windows.length) {
        return `
            <tr>
                <td colspan="${showPhotos ? 12 : 11}" class="empty">No items captured on this project.</td>
            </tr>`;
    }

    return windows.map(window => {

        const number = escapeEmailHtml(
            window.windowNumber || window.id || ""
        );

        const type = escapeEmailHtml(window.productType || "");
        const description = escapeEmailHtml(window.description || "");
        const location = escapeEmailHtml(window.location || "");
        const length = escapeEmailHtml(worksheetSize(window.length));
        const width = escapeEmailHtml(worksheetSize(window.width));

        const frame = escapeEmailHtml(
            window.customFrameColour || window.frameColour || ""
        );

        const glass = escapeEmailHtml(window.glassType || "");
        const allocated = escapeEmailHtml(window.allocatedTo || "Unallocated");
        const status = escapeEmailHtml(window.status || "Measured");
        const qc = escapeEmailHtml(window.qcCheck || "Todo");

        /*
           A data URL goes straight into src. escapeHtml keeps a
           crafted value from breaking out of the attribute.
        */
        const photo = showPhotos
            ? `<td class="photo-cell">${window.photo
                ? `<img class="row-photo" src="${escapeEmailHtml(window.photo)}" alt="Window photo">`
                : `<span class="row-photo-none">\u2014</span>`}</td>`
            : "";

        return `
            <tr>
                <td class="mono">${number}</td>
                <td>${type}</td>
                <td>${description}</td>
                <td>${location}</td>
                <td class="num">${length}</td>
                <td class="num">${width}</td>
                <td>${frame}</td>
                <td>${glass}</td>
                <td>${allocated}</td>
                <td>${status}</td>
                <td>${qc}</td>
                ${photo}
            </tr>`;
    }).join("");
}

/*
   The whole worksheet as an HTML document string.

   Returns "" when there is no project, so the caller can decide
   what to do rather than attaching an empty sheet.
*/
function createProjectWorksheetHtml(project) {

    if (!project) {
        return "";
    }

    const windows = Array.isArray(project.windows)
        ? project.windows
        : [];

    const projectNumber = escapeEmailHtml(project.projectNumber || "");
    const projectName = escapeEmailHtml(project.projectName || "");
    const customerName = escapeEmailHtml(project.customerName || "");
    const customerEmail = escapeEmailHtml(project.customerEmail || "");
    const customerPhone = escapeEmailHtml(project.customerPhone || "");
    const siteAddress = escapeEmailHtml(project.siteAddress || "");

    const generated = new Date().toLocaleDateString("en-ZA", {
        day: "numeric", month: "short", year: "numeric"
    });

    /*
       Distinct values, capped, so a job with fifteen colours does
       not turn the summary row into a paragraph. Mirrors the
       summarise() helper used by the printed project sheet.
    */
    const distinct = (key) => [...new Set(
        windows.map(item => String(item[key] ?? "").trim()).filter(Boolean)
    )];

    const summarise = (values) => {

        if (!values.length) {
            return "\u2014";
        }

        if (values.length <= 2) {
            return values.join(", ");
        }

        return `${values.slice(0, 2).join(", ")} +${values.length - 2} more`;
    };

    const passCount = windows.filter(
        item => String(item.qcCheck ?? "").toLowerCase() === "pass"
    ).length;

    const itemCount =
        `${windows.length} item${windows.length === 1 ? "" : "s"}`;

    /*
       Only carry a photo column when the job actually has photos.
       An empty column heading over a strip of dashes would waste
       width on a sheet that is already eleven columns wide.
    */
    const showPhotos = windows.some(
        item => String(item.photo ?? "").trim()
    );

    const photoHeader = showPhotos
        ? `<th>Photo</th>`
        : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Project Worksheet — ${projectNumber}</title>
<style>
    @page { size: A4 landscape; margin: 10mm; }

    body {
        font-family: Arial, Helvetica, sans-serif;
        color: #111827;
        margin: 0;
        padding: 6mm;
        font-size: 10pt;
    }

    .letterhead {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        border-bottom: 2px solid #111827;
        padding-bottom: 6px;
        margin-bottom: 10px;
    }

    .letterhead h1 {
        margin: 0;
        font-size: 15pt;
        letter-spacing: 0.02em;
    }

    .letterhead .contact {
        text-align: right;
        font-size: 8.5pt;
        line-height: 1.5;
        color: #374151;
    }

    .titleblock {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #f3f4f6;
        border: 1px solid #d1d5db;
        padding: 6px 10px;
        margin-bottom: 10px;
    }

    .titleblock h2 {
        margin: 0;
        font-size: 12pt;
    }

    .titleblock .sub {
        margin: 2px 0 0;
        font-size: 9pt;
        color: #4b5563;
    }

    .titleblock .chip {
        border: 1px solid #111827;
        padding: 3px 10px;
        font-size: 9pt;
        font-weight: bold;
        white-space: nowrap;
    }

    .details {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 10px;
        font-size: 9pt;
    }

    .details th,
    .details td {
        border: 1px solid #d1d5db;
        padding: 4px 6px;
        text-align: left;
        vertical-align: top;
    }

    .details th {
        background: #f9fafb;
        font-weight: bold;
        width: 12%;
    }

    .section-title {
        font-size: 11pt;
        margin: 0 0 6px;
        padding-bottom: 3px;
        border-bottom: 1px solid #9ca3af;
    }

    .schedule {
        width: 100%;
        border-collapse: collapse;
        font-size: 8.5pt;
    }

    .schedule thead {
        display: table-header-group;
    }

    .schedule th,
    .schedule td {
        border: 0.5pt solid #6b7280;
        padding: 3px 5px;
        text-align: left;
        vertical-align: top;
    }

    .schedule th {
        background: #e5e7eb;
    }

    .schedule tbody tr:nth-child(even) td {
        background: #f9fafb;
    }

    .schedule tr { break-inside: avoid; }

    .schedule .num { text-align: right; white-space: nowrap; }
    .schedule .mono { font-family: "Courier New", monospace; }
    .schedule .empty { text-align: center; color: #6b7280; padding: 10px; }

    /*
       Photos print as a small thumbnail beside their row. height
       with auto width keeps each image's aspect ratio, so a tall
       photo and a wide one both sit in the row without distortion.
    */
    .schedule .photo-cell { text-align: center; padding: 2px; }

    .schedule .row-photo {
        height: 34px;
        max-width: 100%;
        object-fit: contain;
        border: 1px solid #9ca3af;
    }

    /* A window with no photo says so, rather than leaving a blank. */
    .schedule .row-photo-none { color: #9ca3af; }

    .signoff {
        display: flex;
        gap: 16px;
        margin-top: 12px;
        font-size: 9pt;
    }

    .signoff div {
        flex: 1;
        border: 1px solid #d1d5db;
        padding: 5px 8px 22px;
    }

    .signoff span {
        color: #6b7280;
    }

    .notes {
        border: 1px solid #d1d5db;
        height: 20mm;
        margin-top: 8px;
    }

    footer {
        margin-top: 10px;
        font-size: 7.5pt;
        color: #6b7280;
        border-top: 1px solid #d1d5db;
        padding-top: 4px;
        display: flex;
        justify-content: space-between;
    }
</style>
</head>
<body>

    <div class="letterhead">
        <h1>${escapeEmailHtml(EMAIL_COMPANY.name)}</h1>
        <div class="contact">
            ${escapeEmailHtml(EMAIL_COMPANY.email)}<br>
            ${escapeEmailHtml(EMAIL_COMPANY.phone)}
        </div>
    </div>

    <div class="titleblock">
        <div>
            <h2>Window &amp; Door Manufacturing Worksheet</h2>
            <p class="sub">${projectName || "Project schedule"}</p>
        </div>
        <div class="chip">${itemCount}</div>
    </div>

    <table class="details">
        <tr>
            <th>Project</th>
            <td>${projectNumber || "\u2014"}</td>
            <th>Customer</th>
            <td>${customerName || "\u2014"}</td>
            <th>Date</th>
            <td>${escapeEmailHtml(generated)}</td>
        </tr>
        <tr>
            <th>Site</th>
            <td>${siteAddress || "\u2014"}</td>
            <th>Contact</th>
            <td>${[customerEmail, customerPhone].filter(Boolean).join(" · ") || "\u2014"}</td>
            <th>QC</th>
            <td>${windows.length ? `${passCount} of ${windows.length} passed` : "\u2014"}</td>
        </tr>
        <tr>
            <th>Type</th>
            <td>${escapeEmailHtml(summarise(distinct("productType")))}</td>
            <th>Frame</th>
            <td>${escapeEmailHtml(summarise(distinct("frameColour")))}</td>
            <th>Glass</th>
            <td>${escapeEmailHtml(summarise(distinct("glassType")))}</td>
        </tr>
    </table>

    <h3 class="section-title">Window &amp; Door Schedule</h3>

    <table class="schedule">
        <thead>
            <tr>
                <th>Item</th>
                <th>Type</th>
                <th>Description</th>
                <th>Location</th>
                <th>Length</th>
                <th>Width</th>
                <th>Frame</th>
                <th>Glass</th>
                <th>Allocated</th>
                <th>Status</th>
                <th>QC</th>
                ${photoHeader}
            </tr>
        </thead>
        <tbody>
            ${worksheetScheduleRows(windows, showPhotos)}
        </tbody>
    </table>

    <div class="signoff">
        <div><span>Manufactured by</span></div>
        <div><span>Checked by</span></div>
        <div><span>Date completed</span></div>
    </div>

    <div class="notes"></div>

    <footer>
        <span>${projectNumber || ""} ${projectName || ""}</span>
        <span>Generated ${escapeEmailHtml(generated)}</span>
    </footer>

</body>
</html>
`;
}

/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeEmailHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/*
   Base64 for the attachment body.

   btoa() cannot take arbitrary text - a description with an accent
   or a curly quote throws. Encoding to UTF-8 bytes first is what
   makes those characters safe.
*/
function base64EncodeText(text) {

    const bytes = new TextEncoder().encode(text);

    let binary = "";

    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary);
}

/*
   Wrap the worksheet so it can ride along with an email.

   Returns [] when there is nothing to attach, which postEmail
   treats as "no attachments" - the message still goes out.
*/
function buildWorksheetAttachment(project) {

    const html = createProjectWorksheetHtml(project);

    if (!html) {
        return [];
    }

    const number = String(project.projectNumber || "project")
        .replace(/[^a-z0-9\-_]+/gi, "-")
        .replace(/^-+|-+$/g, "");

    return [{
        filename: `AGA-Project-Worksheet-${number || "project"}.html`,
        content: base64EncodeText(html)
    }];
}

/* Expose the pieces app.js calls. */
window.sendProductionEmail = sendProductionEmail;
window.sendProductionStartEmail = sendProductionStartEmail;
window.sendNewProjectEmail = sendNewProjectEmail;
window.createProjectWorksheetHtml = createProjectWorksheetHtml;
window.buildWorksheetAttachment = buildWorksheetAttachment;
window.OFFICE_RECIPIENTS = OFFICE_RECIPIENTS;
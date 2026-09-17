/* =========================================================
AGA SPREADSHEET EXPORT
=========================================================

Turns the workshop data into spreadsheets that open in Excel and
Google Sheets.

THIS RUNS IN THE BACKGROUND
---------------------------
There is no button for this anywhere in the app. The workshop
never sees it and never has to think about it. This file only
builds the spreadsheet and hands it back as CSV text; whatever
does the delivering - a nightly job, a Supabase Edge Function, or
the small helper described in EXPORT-AND-DRIVE.md - calls it and
then puts the file in Google Drive.

Because nothing here touches the page, it can be required by a
Node script as well as loaded in the browser.

WHY CSV
-------
A .csv file is the one spreadsheet format every tool accepts,
including Google Drive. Google Sheets opens it directly, and once
open it can be saved as a native sheet and shared.

WHAT IS EXPORTED
----------------
Everything comes from the same data the app already holds: the
copy on this device, plus anything pulled from the cloud. Nothing
is sent anywhere to build the CSV, so it works with no signal.
*/

/* =========================================================
CSV WRITING
========================================================= */

/*
   One CSV cell. Excel and Sheets both treat a leading =, +, -
   or @ as the start of a formula, so a description beginning
   with one of those - and a customer called "=Smith" - has to be
   neutralised or it will be evaluated instead of shown.
*/
function csvCell(value) {
    if (value === null || value === undefined) {
        return "";
    }

    let text = String(value);

    /* A data URL photo would bury the sheet; note that one exists. */
    if (text.indexOf("data:image") === 0) {
        return "[photo]";
    }

    if (/^[=+\-@]/.test(text)) {
        text = "'" + text;
    }

    /* RFC 4180: quote anything containing a comma, quote or newline. */
    if (/[",\n\r]/.test(text)) {
        text = '"' + text.replace(/"/g, '""') + '"';
    }

    return text;
}

function csvRow(cells) {
    return cells.map(csvCell).join(",");
}

/*
   Supabase returns JSON for the columns this app stores as JSON
   text, and a plain string for others. Flatten whatever comes in
   so a cell never reads "[object Object]".
*/
function csvPlain(value) {
    if (value === null || value === undefined) {
        return "";
    }

    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch (error) {
            return "";
        }
    }

    return value;
}

/*
   A human-readable date. The app stores ISO strings, which
   spreadsheets parse happily, but "2026-09-15 08:14" reads better
   on a workshop printout than a full timestamp with milliseconds.
*/
function csvDate(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (isNaN(date.getTime())) {
        return String(value);
    }

    return exportStamp(date);
}

/*
   "2026-09-15 08:14" - the same stamp the quote screen prints.

   This is defined here, not borrowed from quotes.js, because this
   file is also required by a Node background job where quotes.js is
   not loaded. Depending on that global made csvDate() and
   csvFilename() throw "quoteStamp is not defined" outside the
   browser, which is exactly the case the header promises works.

   Kept byte-for-byte identical to quotes.js/quoteStamp so a date
   looks the same whether it is printed on a quote or exported.
*/
function exportStamp(date) {
    const pad = value => String(value).padStart(2, "0");

    const day = [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join("-");

    const time = [
        pad(date.getHours()),
        pad(date.getMinutes())
    ].join(":");

    const space = String.fromCharCode(32);

    return day + space + time;
}

/* =========================================================
FILES
========================================================= */

/* A dated filename, so exports from different days do not collide. */
function csvFilename(prefix) {
    const stamp = exportStamp(new Date()).split(" ")[0];

    return "AGA-" + prefix + "-" + stamp + ".csv";
}

/* =========================================================
WHAT WE CAN READ
=========================================================

The app already holds three collections. They are read through
the same accessors the screens use, and each one is guarded, so
an export never fails because one collection is empty.
*/
function exportableProjects() {
    try {
        return typeof getProjects === "function" ? getProjects() || [] : [];
    } catch (error) {
        console.error("AGA export: projects unavailable:", error);

        return [];
    }
}

function exportableWindows() {
    try {
        return typeof getWindows === "function" ? getWindows() || [] : [];
    } catch (error) {
        console.error("AGA export: windows unavailable:", error);

        return [];
    }
}

function exportableEmployees() {
    try {
        return typeof getEmployees === "function" ? getEmployees() || [] : [];
    } catch (error) {
        console.error("AGA export: employees unavailable:", error);

        return [];
    }
}

function exportableActivity() {
    try {
        return typeof getActivity === "function" ? getActivity() || [] : [];
    } catch (error) {
        console.error("AGA export: activity unavailable:", error);

        return [];
    }
}

/*
   Every window on a project, whether the project stores them
   inline or the windows live in their own collection. The app
   has used both shapes, so both are handled.
*/
function windowsForProject(project, allWindows) {
    if (Array.isArray(project.windows) && project.windows.length) {
        return project.windows;
    }

    return allWindows.filter(window => {
        const projectId = window.projectId || window.project_id;

        return projectId && projectId === project.id;
    });
}

/* =========================================================
THE SHEETS
========================================================= */

/*
   Sheet 1: every window and door, which is the sheet the
   workshop actually works from. One row per item, with its
   project and its current status.
*/
function buildWindowsSheet() {
    const projects = exportableProjects();
    const windows = exportableWindows();

    const projectById = new Map();
    projects.forEach(project => projectById.set(project.id, project));

    const rows = [
        csvRow([
            "Window / Door ID",
            "Project Number",
            "Project Name",
            "Customer",
            "Site Address",
            "Item",
            "Description",
            "Location",
            "Length (mm)",
            "Width (mm)",
            "Frame Colour",
            "Glass Type",
            "Status",
            "Allocated To",
            "Manufactured By",
            "Quality Check",
            "Checked By",
            "Created"
        ])
    ];

    /* Projects first, then any orphan windows, so nothing is lost. */
    const seen = new Set();

    projects.forEach(project => {
        windowsForProject(project, windows).forEach(item => {
            seen.add(item.id);
            rows.push(windowRow(item, project));
        });
    });

    windows.forEach(item => {
        if (seen.has(item.id)) {
            return;
        }

        const project = projectById.get(item.projectId || item.project_id);

        rows.push(windowRow(item, project));
    });

    return rows;
}

/*
   Reads a field that the app stores under its own name, falling
   back to the snake_case name Supabase returns, so the same
   row works whether it came from this device or the cloud.
*/
function pick(item, camel, snake) {
    if (item[camel] !== undefined && item[camel] !== null && item[camel] !== "") {
        return csvPlain(item[camel]);
    }

    return csvPlain(item[snake]);
}

function windowRow(item, project) {
    return csvRow([
        pick(item, "windowNumber", "window_number"),
        project ? project.projectNumber || "" : "",
        project ? project.projectName || "" : "",
        project ? project.customerName || "" : "",
        project ? project.siteAddress || "" : "",
        pick(item, "productType", "product_type"),
        pick(item, "description", "description"),
        pick(item, "location", "location"),
        /* Supabase returns length_mm/width_mm, which reads back from
           its own row as lengthMm/widthMm - so all three names have to
           be tried before giving up on a dimension. */
        pick(item, "length", "length_mm") || pick(item, "lengthMm", "length_mm"),
        pick(item, "width", "width_mm") || pick(item, "widthMm", "width_mm"),
        pick(item, "frameColour", "frame_colour"),
        pick(item, "glassType", "glass_type"),
        pick(item, "status", "status"),
        pick(item, "allocatedTo", "allocated_to"),
        pick(item, "manufacturedBy", "manufactured_by"),
        /* The quality check holds the approved check labels. */
        pick(item, "qcCheck", "qc_check").replace(/\|/g, "; "),
        pick(item, "checkedBy", "checked_by"),
        csvDate(pick(item, "createdAt", "created_at"))
    ]);
}

/*
   Sheet 2: one row per project, with a count of what it
   contains and how much of it is finished.
*/
function buildProjectsSheet() {
    const projects = exportableProjects();
    const windows = exportableWindows();

    const rows = [
        csvRow([
            "Project Number",
            "Project Name",
            "Customer",
            "Email",
            "Phone",
            "Site Address",
            "Items",
            "Installed",
            "Created"
        ])
    ];

    projects.forEach(project => {
        const items = windowsForProject(project, windows);

        const installed = items.filter(
            item => String(item.status || "").toLowerCase() === "installed"
        ).length;

        rows.push(
            csvRow([
                project.projectNumber || "",
                project.projectName || "",
                project.customerName || "",
                project.customerEmail || "",
                project.customerPhone || "",
                project.siteAddress || "",
                items.length,
                installed,
                csvDate(project.createdAt || project.created_at)
            ])
        );
    });

    return rows;
}

/*
   Sheet 3: the productivity log, one row per recorded step.
   This is the sheet that answers "who did what, and when".
*/
function buildActivitySheet() {
    const activity = exportableActivity();

    const rows = [
        csvRow([
            "When",
            "Employee",
            "Step Completed",
            "Window / Door ID",
            "Project Number",
            "Project Name",
            "Description"
        ])
    ];

    /* Oldest first, so the sheet reads as the job progressed. */
    activity
        .slice()
        .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
        .forEach(entry => {
            rows.push(
                csvRow([
                    csvDate(entry.date || entry.createdAt || entry.created_at),
                    entry.employee || entry.employeeName || entry.employee_name || "",
                    entry.status || entry.action || "",
                    entry.windowNumber || entry.window_number || "",
                    entry.projectNumber || entry.project_number || "",
                    entry.projectName || entry.project_name || "",
                    entry.description || ""
                ])
            );
        });

    return rows;
}

/*
   Sheet 4: the team, with how many steps each person has
   recorded. Small, but it is what payroll and supervision ask
   for first.
*/
function buildEmployeesSheet() {
    const employees = exportableEmployees();
    const activity = exportableActivity();

    const counts = new Map();

    const latest = new Map();

    activity.forEach(entry => {
        const name = entry.employee || entry.employeeName || entry.employee_name || "";

        if (!name) {
            return;
        }

        counts.set(name, (counts.get(name) || 0) + 1);

        const when = entry.date || entry.createdAt || entry.created_at;

        if (when && (!latest.has(name) || new Date(when) > new Date(latest.get(name)))) {
            latest.set(name, when);
        }
    });

    const rows = [
        csvRow([
            "Employee Number",
            "Name",
            "Role",
            "Active",
            "Recorded Steps",
            "Last Step Recorded"
        ])
    ];

    employees.forEach(employee => {
        const name = employee.name || "";

        rows.push(
            csvRow([
                employee.employeeNumber || employee.employee_number || "",
                name,
                employee.role || "",
                employee.active === false ? "No" : "Yes",
                counts.get(name) || 0,
                csvDate(latest.get(name))
            ])
        );
    });

    return rows;
}

/* =========================================================
BACKGROUND API
=========================================================

The workshop never presses a button. These are the functions a
scheduled job, a Supabase Edge Function or the small helper in
EXPORT-AND-DRIVE.md calls to collect the data and send it on.
*/

/* Every sheet, as finished CSV text, keyed by sheet name. */
function buildAllSheetCsv() {
    return {
        windows: "\uFEFF" + buildWindowsSheet().join("\r\n") + "\r\n",
        projects: "\uFEFF" + buildProjectsSheet().join("\r\n") + "\r\n",
        activity: "\uFEFF" + buildActivitySheet().join("\r\n") + "\r\n",
        employees: "\uFEFF" + buildEmployeesSheet().join("\r\n") + "\r\n"
    };
}

/*
   One file with every sheet in it, section by section - what the
   background job uploads to Drive.
*/
function buildWorkbookCsv() {
    const parts = [
        ["WINDOWS AND DOORS", buildWindowsSheet],
        ["PROJECTS", buildProjectsSheet],
        ["PRODUCTIVITY", buildActivitySheet],
        ["TEAM", buildEmployeesSheet]
    ];

    const rows = [];

    parts.forEach((part, index) => {
        if (index) {
            rows.push("");
        }

        rows.push(csvRow([part[0]]));
        rows.push.apply(rows, part[1]());
    });

    return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

/* The name the uploader should give the file, dated for today. */
function workbookFilename() {
    return csvFilename("everything");
}

/*
   Is there anything worth sending? A workbook with no rows at all
   is not, and a background job should stay quiet rather than upload
   an empty sheet to Drive every night.
*/
function hasExportableData() {
    return (
        buildWindowsSheet().length > 1 ||
        buildProjectsSheet().length > 1 ||
        buildActivitySheet().length > 1 ||
        buildEmployeesSheet().length > 1
    );
}

/*
   Everything an outside caller needs. Deliberately data only:
   nothing here reads or writes the page, so this file can also be
   required by a Node job with a stubbed localStorage.
*/
window.AGA_EXPORT = {
    /* Finished CSV text. */
    workbookCsv: buildWorkbookCsv,
    allSheetCsv: buildAllSheetCsv,

    /* Raw rows, for anything that wants to reshape them. */
    windows: buildWindowsSheet,
    projects: buildProjectsSheet,
    activity: buildActivitySheet,
    employees: buildEmployeesSheet,

    /* For the uploader. */
    filename: workbookFilename,
    hasData: hasExportableData
};

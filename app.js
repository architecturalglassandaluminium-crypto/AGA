/* =========================================================
AGA ARCHITECTURAL GLASS & ALUMINIUM
Window Workshop Management App
Validation + Error Handling
========================================================= */

"use strict";

/* =========================================================
   CONFIGURATION
   ========================================================= */

const STORAGE_KEY = "aga_windows";
const EMPLOYEE_KEY = "aga_employees";
const PROJECT_KEY = "aga_projects";

/*
   One entry is written here every time a window moves to a new
   production status. That is the single source of truth for the
   productivity dashboard: who did what, on which window, when.
*/
const ACTIVITY_KEY = "aga_activity";

/*
   Frame colours offered on every window row.
*/
const FRAME_COLOURS = [
    "Natural Aluminium",
    "Clear Anodised",
    "Bronze",
    "Charcoal",
    "Black",
    "White",
    "Dark Bronze",
    "Custom"
];

/*
   Glass types offered on every window row.
*/
const GLASS_TYPES = [
    "Clear",
    "Obscure"
];

/*
   Product type. A job is not only windows - it also covers doors,
   and the workshop builds several distinct kinds. Grouping them
   keeps the capture sheet readable and lets the schedule be
   filtered by what is actually being made.
*/
const PRODUCT_TYPES = [
    { group: "Windows", value: "Window" },
    { group: "Windows", value: "Sliding Window" },
    { group: "Windows", value: "Casement Window" },
    { group: "Windows", value: "Awning Window" },
    { group: "Windows", value: "Shopfront" },
    { group: "Doors", value: "Aluminium Door" },
    { group: "Doors", value: "Panel Door" },
    { group: "Doors", value: "Concertina Door" },
    { group: "Doors", value: "Workshop Door" },
    { group: "Doors", value: "Stacking Door" },
    { group: "Doors", value: "Sliding Door" }
];

/*
   Plain list of the values, for validation.
*/
const PRODUCT_TYPE_VALUES = PRODUCT_TYPES.map(item => item.value);

/*
   A type is a door if its name says so - used to label rows and
   to decide whether a glass type is required (a workshop door is
   often solid, so glass is optional for it).
*/
function isDoorType(value) {
    return safeText(value).toLowerCase().includes("door");
}

/*
   Product type as a badge. Doors are tinted differently from
   windows, so the two kinds can be told apart at a glance in a
   long schedule.
*/
function productTypeBadgeHtml(productType) {

    const value = safeText(productType);

    if (!value) {
        return `<span class="type-badge type-none">Not set</span>`;
    }

    const cls = isDoorType(value)
        ? "type-badge type-door"
        : "type-badge type-window";

    return `<span class="${cls}">${escapeHtml(value)}</span>`;
}

/*
   Quality control result recorded per window.
*/
const QC_CHECKS = [
    "Pass",
    "Fail"
];

const STATUSES = [
    "Measured",
    "In Production",
    "Frame Manufactured",
    "Manufacturing Completed",
    "Quality Checked",
    "Wrapped",
    "Ready for Installation",
    "Installed",
    "Project Completed"
];

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

/*
   Measurement validation rules.
   The FINAL (order size) must agree with the readings taken
   on site. If the site readings disagree with the final size
   the window would be manufactured wrong, so we force the
   measured person to confirm.
*/
const MEASURE_TOLERANCE_MM = 10;    // final vs average of site readings
const MEASURE_MAX_SPREAD_MM = 30;   // any single reading vs final
const MAX_MEASURE_MM = 10000;

/* =========================================================
   SAFE DOM HELPERS
   ========================================================= */

function $(id) {
    return document.getElementById(id);
}

function safeText(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value).trim();
}

function uuid() {
    if (crypto?.randomUUID) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random()}`;
}

/* =========================================================
   ERROR HANDLING
   ========================================================= */

function showError(message) {
    console.error("AGA APP ERROR:", message);

    showToast(message, "error");
}

function showSuccess(message) {
    showToast(message, "success");
}

function showToast(message, type = "success") {
    const toast = $("toast");

    if (!toast) {
        alert(message);
        return;
    }

    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add("show");

    clearTimeout(window.agaToastTimer);

    window.agaToastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 4000);
}

/* =========================================================
   LOCAL STORAGE
   ========================================================= */

function getWindows() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);

        if (!Array.isArray(parsed)) {
            console.warn("Invalid windows data found in localStorage.");
            return [];
        }

        return parsed;
    } catch (error) {
        console.error("Could not read windows:", error);

        showError(
            "The saved window data could not be loaded. Please refresh the page."
        );

        return [];
    }
}

function saveWindows(windows) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(windows)
        );

        return true;
    } catch (error) {
        console.error("Could not save windows:", error);

        showError(
            "The window could not be saved. Your browser storage may be full."
        );

        return false;
    }
}

function getEmployees() {
    try {
        const stored = localStorage.getItem(EMPLOYEE_KEY);

        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed;
    } catch (error) {
        console.error("Could not load employees:", error);

        showError(
            "Employee information could not be loaded."
        );

        return [];
    }
}

function saveEmployees(employees) {
    try {
        localStorage.setItem(
            EMPLOYEE_KEY,
            JSON.stringify(employees)
        );

        return true;
    } catch (error) {
        console.error("Could not save employees:", error);

        showError(
            "The employee could not be saved."
        );

        return false;
    }
}

/*
   PROJECTS
   A project is a single job (site) that contains one or many
   windows. Each window is stored as a flat row:

       { description, location, length, width, frameColour }
*/

function getProjects() {
    try {
        const stored = localStorage.getItem(PROJECT_KEY);

        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);

        if (!Array.isArray(parsed)) {
            console.warn("Invalid project data found in localStorage.");
            return [];
        }

        return parsed;
    } catch (error) {
        console.error("Could not read projects:", error);

        showError(
            "The saved project data could not be loaded. Please refresh the page."
        );

        return [];
    }
}

function saveProjects(projects) {
    try {
        localStorage.setItem(
            PROJECT_KEY,
            JSON.stringify(projects)
        );

        /*
           Queue the changed project for upload. Hooking in here -
           rather than at each call site - means every path that
           saves a project is covered automatically, including any
           added later.
        */
        queueProjectUploads(projects);

        return true;
    } catch (error) {
        console.error("Could not save projects:", error);

        showError(
            "The project could not be saved. Your browser storage may be full."
        );

        return false;
    }
}

/*
   Work out which projects actually changed and queue just those.

   Comparing against the last-known server copy keeps the queue
   small: editing one window in a 200-window job uploads that
   job once, not every job on the phone.
*/
function queueProjectUploads(projects) {

    if (typeof isBackendConfigured !== "function" || !isBackendConfigured()) {
        return;
    }

    const queue = getSyncQueue();

    /*
       Work out what the queue already knows about, so a project
       edited three times before signal returns is uploaded once.
    */
    const alreadyQueued = new Set(
        queue
            .filter(change => change.type === "project")
            .map(change => change.projectId)
    );

    (projects || []).forEach(project => {

        if (alreadyQueued.has(project.id)) {
            return;
        }

        enqueue({
            type: "project",
            projectId: project.id
        });
    });
}

/* =========================================================
   ACTIVITY LOG (PRODUCTIVITY)
   =========================================================

   Every status change writes one record:

       { id, windowId, windowNumber, projectNumber, description,
         status, employeeId, employee, date }

   The dashboard only ever reads this list - it never reads the
   windows themselves for productivity, so the numbers stay
   correct even if a window is later deleted.
*/

function getActivity() {

    try {
        const stored = localStorage.getItem(ACTIVITY_KEY);

        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);

        if (!Array.isArray(parsed)) {
            console.warn("Invalid activity data found in localStorage.");
            return [];
        }

        return parsed;

    } catch (error) {

        console.error("Could not read activity:", error);

        return [];
    }
}

function saveActivity(activity) {

    try {
        localStorage.setItem(
            ACTIVITY_KEY,
            JSON.stringify(activity)
        );

        return true;

    } catch (error) {

        console.error("Could not save activity:", error);

        showError(
            "The work record could not be saved. Your browser storage may be full."
        );

        return false;
    }
}

/*
   Record one completed production step against an employee.
*/
function logActivity(item, status, employeeId, employeeName) {

    if (!item || !status || !employeeName) {
        return false;
    }

    const activity = getActivity();

    const entry = {
        id: uuid(),
        windowId: item.id,
        windowNumber: safeText(item.windowNumber),
        projectNumber: safeText(item.projectNumber),
        projectName: safeText(item.projectName),
        description: safeText(item.description),
        status,
        employeeId: safeText(employeeId),
        employee: employeeName,
        date: new Date().toISOString()
    };

    activity.push(entry);

    /*
       The activity log feeds productivity, so it is uploaded as
       its own append-only record. Being append-only, it can never
       conflict with another phone's entry.
    */
    if (typeof isBackendConfigured === "function" && isBackendConfigured()) {
        enqueue({
            type: "activity",
            entry
        });
    }

    return saveActivity(activity);
}

/* =========================================================
   VALIDATION HELPERS
   ========================================================= */

function validateRequired(value, fieldName) {
    if (!safeText(value)) {
        return `${fieldName} is required.`;
    }

    return null;
}

function validateEmail(email) {
    const value = safeText(email);

    if (!value) {
        return "Customer email address is required.";
    }

    /*
       Reasonably strict email validation.
    */
    const emailRegex =
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailRegex.test(value)) {
        return "Please enter a valid customer email address.";
    }

    if (value.length > 254) {
        return "The email address is too long.";
    }

    return null;
}

function validateMeasurement(value, fieldName) {
    const number = Number(value);

    if (value === "" || value === null || value === undefined) {
        return `${fieldName} is required.`;
    }

    if (!Number.isFinite(number)) {
        return `${fieldName} must be a valid number.`;
    }

    if (number <= 0) {
        return `${fieldName} must be greater than 0.`;
    }

    if (number > 10000) {
        return `${fieldName} cannot be greater than 10,000 mm.`;
    }

    return null;
}

function validateFrameColour(value) {
    const colour = safeText(value);

    if (!colour) {
        return "Frame colour is required.";
    }

    if (colour.length > 100) {
        return "Frame colour is too long.";
    }

    return null;
}

function validatePhoto(file) {
    if (!file) {
        return "A photo of the window is required.";
    }

    if (!file.type.startsWith("image/")) {
        return "Please upload an image file.";
    }

    if (file.size > MAX_PHOTO_SIZE) {
        return "The photo must be smaller than 5 MB.";
    }

    return null;
}

/* =========================================================
   WINDOW FORM VALIDATION
   ========================================================= */

function validateConsistency(finalValue, readings, fieldName) {
    /*
       The FINAL order size must agree with the actual site readings.
       This stops a typo in the final size from sending the workshop
       the wrong measurement.
    */
    const errors = [];

    const finalNumber = Number(finalValue);

    if (!Number.isFinite(finalNumber) || finalNumber <= 0) {
        return errors;
    }

    const validReadings = readings.filter(
        value => {
            const n = Number(value);
            return value !== "" && Number.isFinite(n) && n > 0;
        }
    );

    if (validReadings.length === 0) {
        return errors;
    }

    const furthest = Math.max(
        ...validReadings.map(
            value => Math.abs(Number(value) - finalNumber)
        )
    );

    if (furthest > MEASURE_MAX_SPREAD_MM) {
        errors.push(
            `${fieldName}: one of the site readings is more than ${MEASURE_MAX_SPREAD_MM} mm from the final ${fieldName.toLowerCase()} of ${finalNumber} mm. Please check.`
        );
    }

    const average =
        validReadings.reduce(
            (sum, value) => sum + Number(value),
            0
        ) / validReadings.length;

    if (Math.abs(average - finalNumber) > MEASURE_TOLERANCE_MM) {
        errors.push(
            `${fieldName}: the final size (${finalNumber} mm) is more than ${MEASURE_TOLERANCE_MM} mm from the site average (${Math.round(average)} mm). Please check.`
        );
    }

    return errors;
}

function validateWindowForm() {
    const errors = [];

    const projectName = safeText($("projectName")?.value);
    const customerName = safeText($("customerName")?.value);
    const customerEmail = safeText($("customerEmail")?.value);
    const customerPhone = safeText($("customerPhone")?.value);
    const siteAddress = safeText($("siteAddress")?.value);
    const windowLocation = safeText($("windowLocation")?.value);
    const windowType = safeText($("windowType")?.value);
    const quantity = safeText($("quantity")?.value);

    const widthTop = safeText($("widthTop")?.value);
    const widthMiddle = safeText($("widthMiddle")?.value);
    const widthBottom = safeText($("widthBottom")?.value);
    const finalWidth = safeText($("finalWidth")?.value);

    const heightLeft = safeText($("heightLeft")?.value);
    const heightMiddle = safeText($("heightMiddle")?.value);
    const heightRight = safeText($("heightRight")?.value);
    const finalHeight = safeText($("finalHeight")?.value);

    const frameColour = safeText($("frameColour")?.value);
    const customFrameColour = safeText($("customFrameColour")?.value);
    const frameSeries = safeText($("frameSeries")?.value);

    const glassType = safeText($("glassType")?.value);

    const photoInput = $("windowPhoto");

    /*
       Required project information
    */
    const projectNameError = validateRequired(projectName, "Project name");
    if (projectNameError) {
        errors.push(projectNameError);
    } else if (projectName.length > 150) {
        errors.push("Project name cannot exceed 150 characters.");
    }

    const customerNameError = validateRequired(customerName, "Customer name");
    if (customerNameError) {
        errors.push(customerNameError);
    } else if (customerName.length < 2) {
        errors.push("Customer name must contain at least 2 characters.");
    } else if (customerName.length > 150) {
        errors.push("Customer name cannot exceed 150 characters.");
    }

    /*
       Email is optional, but if present it must be valid.
    */
    if (customerEmail) {
        const emailError = validateEmail(customerEmail);
        if (emailError) {
            errors.push(emailError);
        }
    }

    if (customerPhone && customerPhone.length > 30) {
        errors.push("Customer phone number is too long.");
    }

    const locationError = validateRequired(windowLocation, "Window location");
    if (locationError) {
        errors.push(locationError);
    }

    const typeError = validateRequired(windowType, "Window / door type");
    if (typeError) {
        errors.push(typeError);
    }

    const quantityNumber = Number(quantity);
    if (quantity === "" || !Number.isFinite(quantityNumber) || quantityNumber < 1) {
        errors.push("Quantity must be at least 1.");
    }

    /*
       Final measurements are required and must be sane.
    */
    const widthError = validateMeasurement(finalWidth, "Final width");
    if (widthError) {
        errors.push(widthError);
    }

    const heightError = validateMeasurement(finalHeight, "Final height");
    if (heightError) {
        errors.push(heightError);
    }

    /*
       Cross-check the final sizes against the site readings.
    */
    errors.push(...validateConsistency(
        finalWidth,
        [widthTop, widthMiddle, widthBottom],
        "Width"
    ));

    errors.push(...validateConsistency(
        finalHeight,
        [heightLeft, heightMiddle, heightRight],
        "Height"
    ));

    /*
       Frame colour
    */
    const colourError = validateFrameColour(frameColour);
    if (colourError) {
        errors.push(colourError);
    } else if (
        frameColour.toLowerCase() === "custom" &&
        !safeText(customFrameColour)
    ) {
        errors.push("Please enter the custom frame colour name or code.");
    }

    if (frameSeries && frameSeries.length > 100) {
        errors.push("Frame series is too long.");
    }

    if (
        !safeText(glassType) &&
        (windowType === "Window" || windowType === "Door")
    ) {
        errors.push("Please select the glass type.");
    }

    /*
       Photo
    */
    if (photoInput) {
        const file = photoInput.files?.[0];

        if (file) {
            const photoError = validatePhoto(file);
            if (photoError) {
                errors.push(photoError);
            }
        }
    }

    return errors;
}

/* =========================================================
   DISPLAY VALIDATION ERRORS
   ========================================================= */

function displayValidationErrors(errors) {
    if (!errors || errors.length === 0) {
        return;
    }

    const message =
        "Please correct the following:\n\n" +
        errors.map(error => `• ${error}`).join("\n");

    showError(message);
}

/* =========================================================
   GENERATE UNIQUE WINDOW NUMBER
   ========================================================= */

function generateWindowNumber() {
    const windows = getWindows();

    const year = new Date().getFullYear();

    let number;

    do {
        number =
            `AGA-${year}-` +
            Math.floor(
                100000 + Math.random() * 900000
            );
    } while (
        windows.some(
            item => item.windowNumber === number
        )
    );

    return number;
}

/* =========================================================
   READ PHOTO SAFELY
   ========================================================= */

function readPhoto(file) {
    return new Promise((resolve, reject) => {

        if (!file) {
            reject(
                new Error("No photo was selected.")
            );

            return;
        }

        const validationError =
            validatePhoto(file);

        if (validationError) {
            reject(
                new Error(validationError)
            );

            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            if (!reader.result) {
                reject(
                    new Error(
                        "The photo could not be read."
                    )
                );

                return;
            }

            resolve(reader.result);
        };

        reader.onerror = () => {
            reject(
                new Error(
                    "There was an error reading the photo."
                )
            );
        };

        reader.readAsDataURL(file);
    });
}

/* =========================================================
   COLLECT FORM DATA
   ========================================================= */

function collectWindowFormData() {
    return {
        projectName: safeText($("projectName")?.value),
        customerName: safeText($("customerName")?.value),
        customerEmail: safeText($("customerEmail")?.value),
        customerPhone: safeText($("customerPhone")?.value),
        siteAddress: safeText($("siteAddress")?.value),

        windowLocation: safeText($("windowLocation")?.value),
        windowType: safeText($("windowType")?.value),
        quantity: Math.max(1, Number($("quantity")?.value) || 1),

        widthTop: safeText($("widthTop")?.value),
        widthMiddle: safeText($("widthMiddle")?.value),
        widthBottom: safeText($("widthBottom")?.value),
        finalWidth: Number($("finalWidth")?.value),

        heightLeft: safeText($("heightLeft")?.value),
        heightMiddle: safeText($("heightMiddle")?.value),
        heightRight: safeText($("heightRight")?.value),
        finalHeight: Number($("finalHeight")?.value),

        measurementDepth: safeText($("measurementDepth")?.value),
        openingType: safeText($("openingType")?.value),

        frameColour: safeText($("frameColour")?.value),
        customFrameColour: safeText($("customFrameColour")?.value),
        frameSeries: safeText($("frameSeries")?.value),

        glassType: safeText($("glassType")?.value),
        glassThickness: safeText($("glassThickness")?.value),

        notes: safeText($("notes")?.value)
    };
}

/* =========================================================
   CREATE WINDOW
   ========================================================= */

async function createWindow(event) {
    event?.preventDefault();

    try {

        const errors = validateWindowForm();

        if (errors.length > 0) {
            displayValidationErrors(errors);
            return;
        }

        const windows = getWindows();

        const data = collectWindowFormData();

        const photoFile = $("windowPhoto")?.files?.[0];

        let photo = "";

        if (photoFile) {
            photo = await readPhoto(photoFile);
        }

        const now = new Date().toISOString();

        const newWindow = {
            id: uuid(),

            windowNumber: generateWindowNumber(),

            projectName: data.projectName,
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            customerPhone: data.customerPhone,
            siteAddress: data.siteAddress,

            windowLocation: data.windowLocation,
            windowType: data.windowType,
            quantity: data.quantity,

            widthTop: data.widthTop,
            widthMiddle: data.widthMiddle,
            widthBottom: data.widthBottom,
            finalWidth: data.finalWidth,

            heightLeft: data.heightLeft,
            heightMiddle: data.heightMiddle,
            heightRight: data.heightRight,
            finalHeight: data.finalHeight,

            measurementDepth: data.measurementDepth,
            openingType: data.openingType,

            frameColour: data.frameColour,
            customFrameColour: data.customFrameColour,
            frameSeries: data.frameSeries,

            glassType: data.glassType,
            glassThickness: data.glassThickness,

            notes: data.notes,

            photo,

            status: "Measured",

            manufacturer: "",
            manufacturerId: "",

            manufacturedBy: "",
            manufacturedById: "",

            checkedBy: "",
            checkedById: "",

            createdAt: now,

            updatedAt: now,

            statusHistory: [
                {
                    status: "Measured",
                    date: now,
                    employee: ""
                }
            ]
        };

        windows.push(newWindow);

        const saved = saveWindows(windows);

        if (!saved) {
            return;
        }

        showSuccess(
            `${newWindow.windowNumber} has been saved successfully.`
        );

        resetWindowForm();

        renderAll();

        closeWindowModal();

        viewWindow(newWindow.id);

    } catch (error) {

        console.error(
            "Unexpected error creating window:",
            error
        );

        showError(
            error.message ||
            "Something went wrong while saving the window."
        );
    }
}

/* =========================================================
   RESET WINDOW FORM
   ========================================================= */

function resetWindowForm() {
    const form = $("windowForm");

    if (form) {
        form.reset();
    }

    const preview = $("photoPreview");

    if (preview) {
        preview.innerHTML = "";
        preview.classList.remove("show");
        preview.hidden = true;
    }

    const customColourGroup = $("customColourGroup");

    if (customColourGroup) {
        customColourGroup.hidden = true;
    }
}

/* =========================================================
   UPDATE WINDOW STATUS
   ========================================================= */

function getEmployeeOptions() {
    const employees = getEmployees();

    const options = employees.map(employee =>
        `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)}${employee.number ? ` (${escapeHtml(employee.number)})` : ""}</option>`
    );

    return options.join("");
}

function getEmployeeName(employeeId) {
    if (!employeeId) {
        return "";
    }

    const employee = getEmployees().find(
        item => item.id === employeeId
    );

    return employee ? employee.name : "";
}

function updateWindowStatus(
    windowId,
    newStatus,
    employeeId,
    employeeName = ""
) {

    try {

        if (!windowId) {
            throw new Error(
                "No window was selected."
            );
        }

        if (!STATUSES.includes(newStatus)) {
            throw new Error(
                "Invalid manufacturing status."
            );
        }

        /*
           Windows live inside projects, so resolve the owning
           project and window there. Update the project record (the
           source of truth), then optionally the legacy store.
        */
        const projects = getProjects();

        let ownerProject = null;
        let item = null;

        projects.forEach(project => {

            (project.windows || []).forEach(window => {

                if (window.id === windowId) {
                    /*
                       Keep the actual object from the projects
                       array. getAllWindowsWithProject() returns
                       copies, and mutating a copy would look like
                       it worked while saving nothing.
                    */
                    ownerProject = project;
                    item = window;
                }
            });
        });

        /*
           Fallback for a window captured under the older flow.
        */
        if (!item) {

            const legacy = getWindows().find(
                window => window.id === windowId
            );

            if (legacy) {
                item = legacy;
            }
        }

        if (!item) {
            throw new Error(
                "The selected window could not be found."
            );
        }

        /*
           The flattened view carries the project and customer
           names, which the status history and email both use.
        */
        const context = getAllWindowsWithProject().find(
            window => window.id === windowId
        );

        if (context) {
            item.projectNumber = context.projectNumber;
            item.projectName = context.projectName;
            item.customerName = context.customerName;
            item.customerEmail = context.customerEmail;
            item.description = context.description;
        }

        const effectiveEmployeeName =
            employeeName || getEmployeeName(employeeId);

        if (!effectiveEmployeeName) {
            showError(
                "Please select the employee who completed this step."
            );
            return false;
        }

        /*
           Don't allow moving backwards accidentally.
        */
        const currentIndex =
            STATUSES.indexOf(item.status);

        const newIndex =
            STATUSES.indexOf(newStatus);

        /*
           A STATUS CHANGE REQUIRES A SCAN.

           The window's QR code must have been scanned in this
           session, and the scanner carries the window id it matched
           on window.scannedWindowId. Without that proof the update
           is refused, so a status can never be advanced by editing
           or by calling this function directly from the page.

           The guard is deliberately per-window: scanning window A
           must not unlock changing window B.
        */
        const scannedId = safeText(window.scannedWindowId);

        if (scannedId !== windowId) {

            showError(
                "To change a window's status you must scan its QR code first. Open the Dashboard and use Scan Window."
            );

            return false;
        }

        if (newStatus === item.status) {
            showError(
                `This window is already "${newStatus}".`
            );
            return false;
        }

        /*
           Remember where the window was BEFORE this change, so the
           office is told only on the first move INTO production -
           not on every later edit that leaves it in production.
        */
        const previousStatus = item.status;

        if (
            newIndex < currentIndex
        ) {
            const confirmed = confirm(
                `This window is currently "${item.status}".\n\n` +
                `Are you sure you want to move it back to "${newStatus}"?`
            );

            if (!confirmed) {
                return false;
            }
        }

        /*
           QUALITY CHECK RULE:
           A worker cannot approve their own work. The person who
           checks another worker's work must be a different employee
           to the person who manufactured / worked on the window.
        */
        if (newStatus === "Quality Checked") {

            const previousEmployeeId =
                item.manufacturedById ||
                item.checkedById ||
                "";

            const lastWork = item.statusHistory
                ? [...item.statusHistory].reverse().find(
                    entry => entry.employeeId
                )
                : null;

            const lastWorkerId =
                lastWork?.employeeId || previousEmployeeId;

            if (
                lastWorkerId &&
                employeeId &&
                lastWorkerId === employeeId
            ) {
                showError(
                    "Quality check must be performed by a different employee to the one who manufactured this window."
                );
                return false;
            }

            if (!lastWorkerId) {
                showError(
                    "This window must be manufactured before it can be quality checked."
                );
                return false;
            }
        }

        /*
           When the frame is manufactured, record WHO made it.
        */
        if (newStatus === "Frame Manufactured") {
            item.manufacturedById = employeeId;
            item.manufacturedBy = effectiveEmployeeName;
        }

        /*
           When the window is quality checked, record WHO checked it
           AND set the QC result.

           QC cannot be typed into the project form any more, so the
           scan through this step is what records the outcome: a
           passed inspection. If a window later fails inspection, an
           employee marks it QC fail from the record itself.
        */
        if (newStatus === "Quality Checked") {

            item.checkedById = employeeId;
            item.checkedBy = effectiveEmployeeName;
            item.qcCheckedAt = new Date().toISOString();

            /* Leave an explicit fail alone; otherwise record a pass. */
            if (safeText(item.qcCheck).toLowerCase() !== "fail") {
                item.qcCheck = "Pass";
            }
        }

        const now =
            new Date().toISOString();

        item.status = newStatus;
        item.updatedAt = now;

        if (!Array.isArray(item.statusHistory)) {
            item.statusHistory = [];
        }

        item.statusHistory.push({
            status: newStatus,
            date: now,
            employeeId: employeeId || "",
            employee: effectiveEmployeeName
        });

        /*
           Persist to the projects store, which owns the window.
           Only a legacy-only window is written back to the old
           store.
        */
        if (ownerProject) {

            if (!saveProjects(projects)) {
                return false;
            }

        } else {

            const legacyWindows = getWindows();

            const legacyIndex = legacyWindows.findIndex(
                window => window.id === windowId
            );

            if (legacyIndex !== -1) {
                legacyWindows[legacyIndex] = item;
            }

            if (!saveWindows(legacyWindows)) {
                return false;
            }
        }

        /*
           Queue just this window's status change. Sending only the
           changed fields means two phones moving two different
           windows never overwrite each other.
        */
        if (typeof isBackendConfigured === "function" && isBackendConfigured()) {
            enqueue({
                type: "status",
                windowId: item.id,
                status: newStatus,
                employeeId: safeText(employeeId),
                employeeName: effectiveEmployeeName
            });
        }

        /*
           Record the completed step for the productivity
           dashboard. Done after the window is saved, so a failed
           window save never leaves a phantom work record behind.
        */
        logActivity(item, newStatus, employeeId, effectiveEmployeeName);

        /*
           Email notification (best effort).

           Two messages can go out from a status change:

             1. The customer, on every status (if they gave an address).
             2. The office, ONLY when the window first moves into
                production - that is the moment Tiffany and Jan asked
                to hear about.

           Neither may ever block the status update, so both are fired
           without being awaited and both swallow their own errors.
        */
        if (
            item.customerEmail &&
            typeof sendProductionEmail === "function"
        ) {
            try {
                sendProductionEmail(item, newStatus)
                    .catch(error => {
                        console.error("Email failed:", error);
                    });
            } catch (emailError) {
                console.error("Email error:", emailError);
            }
        }

        if (
            newStatus === "In Production" &&
            previousStatus !== "In Production" &&
            typeof sendProductionStartEmail === "function"
        ) {
            try {
                sendProductionStartEmail(item, effectiveEmployeeName)
                    .catch(error => {
                        console.error("Office email failed:", error);
                    });
            } catch (emailError) {
                console.error("Office email error:", emailError);
            }
        }

        renderAll();

        viewWindow(item.id);

        showSuccess(
            `${item.windowNumber} updated to "${newStatus}".`
        );

        return true;

    } catch (error) {

        console.error(
            "Status update error:",
            error
        );

        showError(
            error.message ||
            "The manufacturing status could not be updated."
        );

        return false;
    }
}

/* =========================================================
   EMPLOYEE VALIDATION
   ========================================================= */

function validateEmployeeForm() {

    const errors = [];

    const name =
        safeText($("employeeName")?.value);

    const number =
        safeText($("employeeNumber")?.value);

    if (!name) {
        errors.push(
            "Employee name is required."
        );
    } else if (name.length < 2) {
        errors.push(
            "Employee name must contain at least 2 characters."
        );
    }

    if (number && number.length > 30) {
        errors.push(
            "Employee number is too long."
        );
    }

    return errors;
}

/* =========================================================
   ADD EMPLOYEE
   ========================================================= */

function addEmployee(event) {

    event?.preventDefault();

    try {

        const errors =
            validateEmployeeForm();

        if (errors.length > 0) {
            displayValidationErrors(errors);
            return;
        }

        const name =
            safeText($("employeeName")?.value);

        const number =
            safeText($("employeeNumber")?.value);

        const employees =
            getEmployees();

        /*
           Prevent duplicate employee names.
        */
        const duplicate =
            employees.some(
                employee =>
                    employee.name.toLowerCase() ===
                    name.toLowerCase()
            );

        if (duplicate) {
            showError(
                "An employee with this name already exists."
            );

            return;
        }

        /*
           The id is taken before the push so the same value goes to
           the cloud. Generating a second one on upload would create
           two rows for one person, which the sign-in list would then
           show twice.
        */
        const employeeId = uuid();

        employees.push({
            id: employeeId,

            name,
            number,

            createdAt:
                new Date().toISOString()
        });

        if (!saveEmployees(employees)) {
            return;
        }

        /*
           Push to the cloud so the new hire appears in the sign-in
           list on every other phone. Until now this only wrote to
           localStorage, so a new employee was invisible to everyone
           but the person who added them.

           Not awaited: the local save is the source of truth, and an
           employee must still be addable with no signal. The result
           only decides which message is shown.
        */
        if (typeof uploadEmployee === "function" && isBackendConfigured()) {

            uploadEmployee(employeeId).then(result => {

                if (result && result.ok) {
                    return;
                }

                if (result && result.reason === "duplicate-name") {
                    showError(
                        `${name} was saved on this device, but someone with this name already exists in the shared team list.`
                    );
                    return;
                }

                showError(
                    `${name} was saved on this device but could not be shared. It will not appear on other phones until the connection is working.`
                );
            });
        }

        showSuccess(
            `${name} has been added. They will choose their own PIN the first time they sign in.`
        );

        const form =
            $("employeeForm");

        if (form) {
            form.reset();
        }

        renderEmployees();

        /* A new employee must be selectable on the scanner and
           in the allocation filter. */
        renderScanEmployeeOptions();
        renderAllocatedFilterOptions();

    } catch (error) {

        console.error(
            "Employee creation error:",
            error
        );

        showError(
            "The employee could not be added."
        );
    }
}

/* =========================================================
   PROJECT WINDOW ROWS
   =========================================================

   Each row of the project table is one window:
   Description, Location, Length, Width, Frame Color.
   Rows live in the DOM and are collected on save.
*/

let projectRowCounter = 0;

function frameColourOptions(selectedValue) {
    return FRAME_COLOURS.map(colour => {
        const selected =
            safeText(colour).toLowerCase() ===
                safeText(selectedValue).toLowerCase()
                ? " selected"
                : "";

        return `<option value="${escapeHtml(colour)}"${selected}>${escapeHtml(colour)}</option>`;
    }).join("");
}

/*
   Show the next window ID on each unsaved row, so the person
   capturing the window can see what number it will get.
   Rows already saved keep the ID they were stored with.
*/
function refreshRowIdPreviews() {

    const tbody = $("projectWindowRows");

    if (!tbody) {
        return;
    }

    let nextId = getHighestWindowId() + 1;

    tbody.querySelectorAll("tr").forEach(tr => {

        const cell = tr.querySelector('[data-field="windowId"]');

        if (!cell) {
            return;
        }

        const stored = tr.dataset.windowNumber;

        if (stored) {
            cell.textContent = stored;
            return;
        }

        cell.textContent = formatWindowId(nextId);

        nextId += 1;
    });
}

function qcCheckOptions(selectedValue) {
    return QC_CHECKS.map(check => {
        const selected =
            safeText(check).toLowerCase() ===
                safeText(selectedValue).toLowerCase()
                ? " selected"
                : "";

        return `<option value="${escapeHtml(check)}"${selected}>${escapeHtml(check)}</option>`;
    }).join("");
}

function glassTypeOptions(selectedValue) {
    return GLASS_TYPES.map(type => {
        const selected =
            safeText(type).toLowerCase() ===
                safeText(selectedValue).toLowerCase()
                ? " selected"
                : "";

        return `<option value="${escapeHtml(type)}"${selected}>${escapeHtml(type)}</option>`;
    }).join("");
}

/*
   Product type options, grouped into Windows and Doors so a long
   list stays quick to scan.
*/
function productTypeOptions(selectedValue) {

    const current = safeText(selectedValue).toLowerCase();

    const groups = {};

    PRODUCT_TYPES.forEach(item => {

        if (!groups[item.group]) {
            groups[item.group] = [];
        }

        const selected =
            safeText(item.value).toLowerCase() === current
                ? " selected"
                : "";

        groups[item.group].push(
            `<option value="${escapeHtml(item.value)}"${selected}>${escapeHtml(item.value)}</option>`
        );
    });

    return Object.entries(groups).map(([group, options]) =>
        `<optgroup label="${escapeHtml(group)}">${options.join("")}</optgroup>`
    ).join("");
}

function addProjectWindowRow(rowData = {}) {

    const tbody = $("projectWindowRows");

    if (!tbody) {
        return;
    }

    projectRowCounter += 1;

    const rowId = `projectRow-${projectRowCounter}`;

    const tr = document.createElement("tr");

    tr.className = "window-row";
    tr.id = rowId;

    tr.innerHTML = `
        <td class="window-row-id-cell">
            <span class="window-row-id" data-field="windowId">${escapeHtml(rowData.windowNumber || "—")}</span>
        </td>
        <td>
            <select class="window-row-input" data-field="productType">
                <option value="">Select type</option>
                ${productTypeOptions(rowData.productType)}
            </select>
        </td>
        <td>
            <input type="text" class="window-row-input" data-field="description"
                placeholder="e.g. Bedroom 1 window" value="${escapeHtml(rowData.description)}">
        </td>
        <td>
            <input type="text" class="window-row-input" data-field="location"
                placeholder="e.g. First floor" value="${escapeHtml(rowData.location)}">
        </td>
        <td>
            <input type="number" class="window-row-input" data-field="length" min="0" step="1"
                placeholder="mm" value="${escapeHtml(rowData.length)}">
        </td>
        <td>
            <input type="number" class="window-row-input" data-field="width" min="0" step="1"
                placeholder="mm" value="${escapeHtml(rowData.width)}">
        </td>
        <td>
            <select class="window-row-input" data-field="frameColour">
                <option value="">Select colour</option>
                ${frameColourOptions(rowData.frameColour)}
            </select>
        </td>
        <td>
            <select class="window-row-input" data-field="glassType">
                <option value="">Select glass</option>
                ${glassTypeOptions(rowData.glassType)}
            </select>
        </td>
        <!--
           QC is read-only here. A quality check is a record of what
           was inspected on the floor, so it is set when the window
           is scanned through its Quality Checked step, not typed in
           by whoever happens to be editing the project.
        -->
        <td class="window-row-qc-readonly" data-field="qcCheck"
            data-qc-value="${escapeHtml(rowData.qcCheck)}"
            title="QC result is recorded by scanning the window through Quality Checked">
            ${qcStatusPillHtml(rowData.qcCheck)}
        </td>
        <td class="window-row-photo-cell">
            <div class="row-photo" data-field="photo">
                <input type="file" class="row-photo-input" accept="image/*" capture="environment"
                    hidden onchange="handleRowPhotoPick(this)">

                <button type="button" class="row-photo-add" title="Add photo"
                    aria-label="Add photo" onclick="this.previousElementSibling.click()">
                    <span class="row-photo-add-icon" aria-hidden="true"></span>
                </button>

                <div class="row-photo-preview" hidden>
                    <img alt="Window photo">
                    <button type="button" class="row-photo-remove" title="Remove photo"
                        onclick="clearRowPhoto(this)">×</button>
                </div>
            </div>
        </td>
        <td class="window-row-actions">
            <button type="button" class="icon-button" title="Remove window row"
                onclick="removeProjectWindowRow('${rowId}')">×</button>
        </td>
    `;

    /*
       Seed the thumbnail when re-opening a saved row.
    */
    if (rowData.photo) {
        setRowPhotoThumbnail(
            tr.querySelector('[data-field="photo"]'),
            rowData.photo
        );
    }

    /*
       Remember a saved ID so refreshing previews does not
       renumber a row that already exists.
    */
    if (rowData.windowNumber) {
        tr.dataset.windowNumber = rowData.windowNumber;
    }

    /*
       Remember which stored window this row represents. When the
       project is edited and saved, this is how the row is matched
       back to its record so its status, allocation and history
       are carried over instead of being recreated.
    */
    if (rowData.id) {
        tr.dataset.windowId = rowData.id;
    }

    tbody.appendChild(tr);

    /*
       Must run AFTER the row is in the table, otherwise the new
       row is not yet visible to the preview refresh.
    */
    refreshRowIdPreviews();
}

/* =========================================================
   ROW PHOTO
   =========================================================

   Every window row can carry one photo. The image is held on the
   file input's sibling <img> as a data URL, so collecting rows on
   save needs no extra bookkeeping.
*/

function setRowPhotoThumbnail(photoCell, dataUrl) {

    if (!photoCell || !dataUrl) {
        return;
    }

    const img = photoCell.querySelector(".row-photo-preview img");
    const preview = photoCell.querySelector(".row-photo-preview");
    const addButton = photoCell.querySelector(".row-photo-add");
    const input = photoCell.querySelector(".row-photo-input");

    if (img) {
        img.src = dataUrl;
    }

    if (preview) {
        preview.hidden = false;
    }

    if (addButton) {
        addButton.hidden = true;
    }

    /*
       Remember the data URL so a row can be collected faithfully
       even if the file input itself is empty (a re-opened row).
    */
    if (input) {
        input.dataset.photo = dataUrl;
    }
}

function handleRowPhotoPick(input) {

    try {

        const file = input?.files?.[0];

        if (!file) {
            return;
        }

        const validationError = validatePhoto(file);

        if (validationError) {
            showError(validationError);
            input.value = "";
            return;
        }

        const photoCell = input.closest('[data-field="photo"]');

        const reader = new FileReader();

        reader.onload = () => {
            setRowPhotoThumbnail(photoCell, String(reader.result));
        };

        reader.onerror = () => {
            showError("The photo could not be read. Please try another image.");
            input.value = "";
        };

        reader.readAsDataURL(file);

    } catch (error) {

        console.error("Row photo error:", error);

        showError("There was a problem with the selected photo.");
    }
}

function clearRowPhoto(button) {

    const photoCell = button?.closest('[data-field="photo"]');

    if (!photoCell) {
        return;
    }

    const img = photoCell.querySelector(".row-photo-preview img");
    const preview = photoCell.querySelector(".row-photo-preview");
    const addButton = photoCell.querySelector(".row-photo-add");
    const input = photoCell.querySelector(".row-photo-input");

    if (img) {
        img.removeAttribute("src");
    }

    if (preview) {
        preview.hidden = true;
    }

    if (addButton) {
        addButton.hidden = false;
    }

    if (input) {
        input.value = "";
        delete input.dataset.photo;
    }
}

window.handleRowPhotoPick = handleRowPhotoPick;
window.clearRowPhoto = clearRowPhoto;

/*
   Open a saved window photo full size.
*/
function openPhotoViewer(button) {

    try {

        const img = button?.querySelector("img");

        if (!img?.src) {
            return;
        }

        const title = $("modalWindowTitle");
        const content = $("modalWindowContent");

        if (title) {
            title.textContent = "Window Photo";
        }

        if (content) {
            content.innerHTML =
                `<div class="photo-viewer"><img src="${escapeHtml(img.src)}" alt="Window photo"></div>`;
        }

        const modal = $("windowModal");

        if (modal) {
            modal.classList.add("open");
            modal.setAttribute("aria-hidden", "false");
        }

    } catch (error) {

        console.error("Photo viewer error:", error);

        showError("The photo could not be opened.");
    }
}

window.openPhotoViewer = openPhotoViewer;

/*
   Show a window's QR code large, so it can be printed, scanned
   from a screen, or checked against a worksheet.
*/
function openQRViewer(button) {

    try {

        const qrSpan = button?.querySelector("[data-qr-window]");

        const windowNumber = qrSpan?.dataset.qrWindow;

        if (!windowNumber) {
            showError("This window does not have an ID yet.");
            return;
        }

        const title = $("modalWindowTitle");
        const content = $("modalWindowContent");

        if (title) {
            title.textContent = `QR Code - ${windowNumber}`;
        }

        if (content) {
            content.innerHTML = `
                <div class="qr-viewer">
                    <div class="qr-viewer-canvas" data-qr-large="${escapeHtml(windowNumber)}"></div>
                    <p class="qr-viewer-id">${escapeHtml(windowNumber)}</p>
                    <p class="details-small">Scan this code to open the window record.</p>
                </div>
            `;
        }

        const modal = $("windowModal");

        if (modal) {
            modal.classList.add("open");
            modal.setAttribute("aria-hidden", "false");
        }

        generateQRCodeInElement(
            content?.querySelector("[data-qr-large]"),
            buildWindowIdQRContent(windowNumber),
            260
        );

    } catch (error) {

        console.error("QR viewer error:", error);

        showError("The QR code could not be opened.");
    }
}

window.openQRViewer = openQRViewer;

window.generateQRCodeInElement = generateQRCodeInElement;

window.buildWindowIdQRContent = buildWindowIdQRContent;

window.renderWindowRowQRCodes = renderWindowRowQRCodes;

window.printLabel = printLabel;

window.printProjectLabels = printProjectLabels;

window.renderLabelSheet = renderLabelSheet;

window.setLabelPreset = setLabelPreset;

window.getLabelPresetName = getLabelPresetName;

window.getLabelPreset = getLabelPreset;

window.applyLabelPreset = applyLabelPreset;

window.openLabelSettings = openLabelSettings;

window.buildLabelSettingsHtml = buildLabelSettingsHtml;

window.findWindowForPrint = findWindowForPrint;

function removeProjectWindowRow(rowId) {

    const row = $(rowId);

    if (!row) {
        return;
    }

    const tbody = $("projectWindowRows");

    row.remove();

    /*
       Always keep at least one row so the workshop can start
       capturing immediately.
    */
    if (tbody && tbody.querySelectorAll("tr").length === 0) {
        addProjectWindowRow();
    }

    refreshRowIdPreviews();
}

window.removeProjectWindowRow = removeProjectWindowRow;

function collectProjectWindowRows() {

    const tbody = $("projectWindowRows");

    if (!tbody) {
        return [];
    }

    return Array.from(
        tbody.querySelectorAll("tr")
    ).map(tr => ({
        productType: safeText(
            tr.querySelector('[data-field="productType"]')?.value
        ),
        description: safeText(
            tr.querySelector('[data-field="description"]')?.value
        ),
        location: safeText(
            tr.querySelector('[data-field="location"]')?.value
        ),
        length: safeText(
            tr.querySelector('[data-field="length"]')?.value
        ),
        width: safeText(
            tr.querySelector('[data-field="width"]')?.value
        ),
        frameColour: safeText(
            tr.querySelector('[data-field="frameColour"]')?.value
        ),
        glassType: safeText(
            tr.querySelector('[data-field="glassType"]')?.value
        ),
        /*
           QC is read-only in this form, so its value is carried
           on the cell as a data attribute. Reading .value here
           would return undefined and wipe a recorded result.
        */
        qcCheck: safeText(
            tr.querySelector('[data-field="qcCheck"]')?.dataset.qcValue
        ),
        photo: safeText(
            tr.querySelector('.row-photo-input')?.dataset.photo
        )
    }));
}

/*
   A blank row (all five fields empty) is simply ignored, so an
   unused row never blocks the save.
*/
function isBlankWindowRow(row) {
    return !row.productType &&
        !row.description &&
        !row.location &&
        !row.length &&
        !row.width &&
        !row.frameColour &&
        !row.glassType &&
        !row.qcCheck &&
        !row.photo;
}

function resetProjectForm() {

    const form = $("projectForm");

    if (form) {
        form.reset();
    }

    const tbody = $("projectWindowRows");

    if (tbody) {
        tbody.innerHTML = "";
    }

    projectRowCounter = 0;

    /*
       Leaving edit mode, so the next save creates a new project
       rather than updating the one we were editing.
    */
    editingProjectId = null;
    updateProjectFormMode();

    addProjectWindowRow();

    if (form) {
        form.hidden = true;
    }
}

/*
   Reflect create vs edit mode in the form itself, so the person
   filling it in can see which project they are changing.
*/
function updateProjectFormMode() {

    const submitButton = document.querySelector(
        '#projectForm button[type="submit"]'
    );

    const heading = $("projectFormMode");

    const cancelButton = $("cancelProjectButton");

    if (editingProjectId) {

        if (submitButton) {
            submitButton.innerHTML =
                `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg> Save Changes`;
        }

        if (heading) {
            heading.hidden = false;
        }

        if (cancelButton) {
            cancelButton.textContent = "Cancel Edit";
        }

        return;
    }

    if (submitButton) {
        submitButton.innerHTML =
            `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg> Save Project`;
    }

    if (heading) {
        heading.hidden = true;
    }

    if (cancelButton) {
        cancelButton.textContent = "Cancel";
    }
}

/*
   Load an existing project into the form for editing.

   Every window is written back into a row, including its stored
   id, so saving can match rows to records and leave production
   state untouched.
*/
function editProject(projectId) {

    try {

        const project = getProjects().find(
            item => item.id === projectId
        );

        if (!project) {
            showError("The project could not be found.");
            return;
        }

        const form = $("projectForm");

        if (!form) {
            return;
        }

        /* Switch into edit mode before filling anything in. */
        editingProjectId = project.id;

        $("prjName").value = project.projectName || "";
        $("prjCustomerName").value = project.customerName || "";
        $("prjCustomerEmail").value = project.customerEmail || "";
        $("prjCustomerPhone").value = project.customerPhone || "";
        $("prjSiteAddress").value = project.siteAddress || "";

        /*
           A date input only accepts yyyy-mm-dd. An older project
           saved before this field existed has no dueDate at all, and
           a value in any other shape would render as an empty box -
           so it is normalised here rather than trusted.
        */
        const dueDateInput = $("prjDueDate");

        if (dueDateInput) {
            dueDateInput.value = normaliseDueDate(project.dueDate);
        }

        const tbody = $("projectWindowRows");

        if (tbody) {
            tbody.innerHTML = "";
        }

        projectRowCounter = 0;

        const windows = Array.isArray(project.windows)
            ? project.windows
            : [];

        if (windows.length) {

            windows.forEach(window => addProjectWindowRow(window));

        } else {

            addProjectWindowRow();
        }

        updateProjectFormMode();

        /* Make sure the Projects tab is showing. */
        switchView("projects");

        form.hidden = false;

        refreshRowIdPreviews();

        form.scrollIntoView({ block: "start", behavior: "smooth" });

        showSuccess(
            `Editing ${project.projectNumber}. Change what you need and press Save Changes.`
        );

    } catch (error) {

        console.error("Edit project error:", error);

        showError("The project could not be opened for editing.");
    }
}

window.editProject = editProject;

function openProjectForm() {

    const form = $("projectForm");

    if (!form) {
        return;
    }

    form.hidden = false;

    refreshRowIdPreviews();

    form.scrollIntoView({ block: "start" });
}

/* =========================================================
   PROJECT VALIDATION
   ========================================================= */

function validateProjectForm() {

    const errors = [];

    const projectName = safeText($("prjName")?.value);
    const customerName = safeText($("prjCustomerName")?.value);
    const customerEmail = safeText($("prjCustomerEmail")?.value);
    const customerPhone = safeText($("prjCustomerPhone")?.value);

    const nameError = validateRequired(projectName, "Project name");
    if (nameError) {
        errors.push(nameError);
    } else if (projectName.length > 150) {
        errors.push("Project name cannot exceed 150 characters.");
    }

    const customerError = validateRequired(customerName, "Customer name");
    if (customerError) {
        errors.push(customerError);
    } else if (customerName.length < 2) {
        errors.push("Customer name must contain at least 2 characters.");
    } else if (customerName.length > 150) {
        errors.push("Customer name cannot exceed 150 characters.");
    }

    if (customerEmail) {
        const emailError = validateEmail(customerEmail);
        if (emailError) {
            errors.push(emailError);
        }
    }

    if (customerPhone && customerPhone.length > 30) {
        errors.push("Customer phone number is too long.");
    }

    const rows = collectProjectWindowRows()
        .filter(row => !isBlankWindowRow(row));

    if (rows.length === 0) {
        errors.push("Add at least one window row to the project.");
    }

    rows.forEach((row, index) => {
        const position = `Row ${index + 1}`;

        if (!row.productType) {
            errors.push(`${position}: select the window or door type.`);
        }

        if (!row.description) {
            errors.push(`${position}: description is required.`);
        }

        if (!row.location) {
            errors.push(`${position}: location is required.`);
        }

        const lengthError = validateMeasurement(row.length, `${position} length`);
        if (lengthError) {
            errors.push(lengthError);
        }

        const widthError = validateMeasurement(row.width, `${position} width`);
        if (widthError) {
            errors.push(widthError);
        }

        if (!row.frameColour) {
            errors.push(`${position}: frame color is required.`);
        }

        if (!row.glassType) {
            errors.push(`${position}: glass type is required.`);
        }
    });

    return errors;
}

/* =========================================================
   CREATE PROJECT
   ========================================================= */

function generateProjectNumber() {

    const projects = getProjects();

    const year = new Date().getFullYear();

    let number;

    do {
        number =
            `AGA-PRJ-${year}-` +
            Math.floor(1000 + Math.random() * 9000);
    } while (
        projects.some(project => project.projectNumber === number)
    );

    return number;
}

/*
   Window ID
   =========================================================

   Every window gets a human-readable ID that keeps counting up
   across ALL projects, so the workshop can refer to "window 7"
   on the floor without ambiguity.

   The next number is derived from the highest ID already saved,
   and reserved IDs are passed in while building a batch so that
   the windows of one project do not all receive the same number.
*/

function getHighestWindowId() {

    let highest = 0;

    getProjects().forEach(project => {
        (project.windows || []).forEach(window => {
            const value = Number(window.windowId);

            if (Number.isFinite(value) && value > highest) {
                highest = value;
            }
        });
    });

    return highest;
}

function formatWindowId(value) {
    return `AGA-WIN-${String(value).padStart(4, "0")}`;
}

/*
   The id of the project currently being edited, or null when the
   form is creating a new one.
*/
let editingProjectId = null;

/*
   Build a window record from a form row.

   When EDITING, an existing window is carried over so nothing that
   the workshop has already recorded is lost: its ID, status,
   allocation, QC result and full status history all survive a
   change of description, size or colour.
*/
function buildWindowFromRow(row, existing, nextWindowId) {

    /*
       A row that came from a saved window keeps a data-window-id;
       that is how we know which stored window it corresponds to.
    */
    const base = existing || {};

    const isNew = !existing;

    return {
        /* Identity: keep what exists, otherwise mint a new one. */
        id: base.id || uuid(),

        windowId: isNew ? nextWindowId : base.windowId,

        windowNumber: isNew
            ? formatWindowId(nextWindowId)
            : (base.windowNumber || formatWindowId(base.windowId)),

        /* Editable specification. */
        productType: row.productType || "Window",
        description: row.description,
        location: row.location,
        length: Number(row.length),
        width: Number(row.width),
        frameColour: row.frameColour,
        glassType: row.glassType,
        qcCheck: row.qcCheck || "",
        photo: row.photo || "",

        /* Production state that must never be reset by an edit. */
        status: base.status || "Measured",
        manufacturer: base.manufacturer || "",
        manufacturerId: base.manufacturerId || "",
        manufacturedBy: base.manufacturedBy || "",
        manufacturedById: base.manufacturedById || "",
        checkedBy: base.checkedBy || "",
        checkedById: base.checkedById || "",

        allocatedTo: base.allocatedTo || "",
        allocatedToId: base.allocatedToId || "",
        allocatedAt: base.allocatedAt || "",

        statusHistory: Array.isArray(base.statusHistory)
            ? base.statusHistory
            : [{
                status: base.status || "Measured",
                date: base.createdAt || new Date().toISOString(),
                employee: ""
            }],

        createdAt: base.createdAt || new Date().toISOString()
    };
}

function createProject(event) {

    event?.preventDefault();

    try {

        const errors = validateProjectForm();

        if (errors.length > 0) {
            displayValidationErrors(errors);
            return;
        }

        const projects = getProjects();

        const now = new Date().toISOString();

        const rows = collectProjectWindowRows()
            .filter(row => !isBlankWindowRow(row));

        /*
           Continue counting from the highest window ID already
           stored, so IDs increase across every project. Only NEW
           rows consume a number; edited rows keep the one they had.
        */
        let nextWindowId = getHighestWindowId() + 1;

        /*
           Editing: find the stored project and index its windows
           by id, so each form row can find its original record.
        */
        const existingProject = editingProjectId
            ? projects.find(item => item.id === editingProjectId)
            : null;

        if (editingProjectId && !existingProject) {
            showError("The project you were editing could not be found.");
            resetProjectForm();
            return;
        }

        const existingById = {};

        if (existingProject) {
            (existingProject.windows || []).forEach(window => {
                existingById[window.id] = window;
            });
        }

        /*
           The row template writes the stored id onto the row, so a
           saved window can be matched back to its record.
        */
        const tbody = $("projectWindowRows");

        const rowIds = tbody
            ? Array.from(tbody.querySelectorAll("tr")).map(tr => tr.dataset.windowId || "")
            : [];

        const windows = rows.map((row, index) => {

            const existing = existingById[rowIds[index]] || null;

            const built = buildWindowFromRow(
                row,
                existing,
                nextWindowId
            );

            if (!existing) {
                nextWindowId += 1;
            }

            return built;
        });

        if (existingProject) {

            /*
               Update the stored project in place. The project
               number and creation date are deliberately kept.
            */
            existingProject.projectName = safeText($("prjName")?.value);
            existingProject.customerName = safeText($("prjCustomerName")?.value);
            existingProject.customerEmail = safeText($("prjCustomerEmail")?.value);
            existingProject.customerPhone = safeText($("prjCustomerPhone")?.value);
            existingProject.siteAddress = safeText($("prjSiteAddress")?.value);
            existingProject.dueDate = safeText($("prjDueDate")?.value);

            existingProject.windows = windows;
            existingProject.updatedAt = now;

            if (!saveProjects(projects)) {
                return;
            }

            showSuccess(
                `${existingProject.projectNumber} updated \u2014 ${windows.length} item${windows.length === 1 ? "" : "s"}.`
            );

            resetProjectForm();

            renderAll();

            return;
        }

        const newProject = {
            id: uuid(),

            projectNumber: generateProjectNumber(),

            projectName: safeText($("prjName")?.value),
            customerName: safeText($("prjCustomerName")?.value),
            customerEmail: safeText($("prjCustomerEmail")?.value),
            customerPhone: safeText($("prjCustomerPhone")?.value),
            siteAddress: safeText($("prjSiteAddress")?.value),

            /*
               The promised date, stored as a plain yyyy-mm-dd
               string. A date-only value with no time and no
               timezone is deliberate: a due date is a calendar day,
               and storing it as a timestamp makes it drift a day for
               anyone east or west of the person who typed it.
            */
            dueDate: safeText($("prjDueDate")?.value),

            windows,

            createdAt: now,
            updatedAt: now
        };

        projects.push(newProject);

        if (!saveProjects(projects)) {
            return;
        }

        /*
           Tell the office a new project has been saved. Best
           effort only: a missing or broken mailer must never undo
           the save or block the workshop, so it is fired without
           being awaited and swallows its own errors.
        */
        if (typeof sendNewProjectEmail === "function") {
            try {
                const session =
                    typeof getSession === "function" ? getSession() : null;

                sendNewProjectEmail(newProject, session?.name || "")
                    .catch(error => {
                        console.error("Office email failed:", error);
                    });
            } catch (emailError) {
                console.error("Office email error:", emailError);
            }
        }

        showSuccess(
            `${newProject.projectNumber} saved with ${windows.length} window${windows.length === 1 ? "" : "s"}.`
        );

        resetProjectForm();

        renderAll();

    } catch (error) {

        console.error(
            "Unexpected error saving project:",
            error
        );

        showError(
            error.message ||
            "Something went wrong while saving the project."
        );
    }
}

/* =========================================================
   PHOTO PREVIEW
   ========================================================= */

function handlePhotoPreview(event) {
    try {
        const file = event.target.files?.[0];
        const preview = $("photoPreview");

        if (!preview) {
            return;
        }

        const showNoPreview = () => {
            preview.innerHTML = "";
            preview.classList.remove("show");
            preview.hidden = true;
        };

        if (!file) {
            showNoPreview();
            return;
        }

        const validationError = validatePhoto(file);

        if (validationError) {
            showError(validationError);
            event.target.value = "";
            showNoPreview();
            return;
        }

        const reader = new FileReader();

        reader.onload = function () {
            preview.innerHTML =
                `<img src="${reader.result}" alt="Window photo preview">`;
            preview.classList.add("show");
            preview.hidden = false;
        };

        reader.onerror = function () {
            showError("The photo preview could not be displayed.");
            event.target.value = "";
        };

        reader.readAsDataURL(file);

    } catch (error) {
        console.error("Photo preview error:", error);

        showError(
            "There was a problem with the selected photo."
        );
    }
}

/* =========================================================
   SEARCH VALIDATION
   ========================================================= */

function filterWindows() {

    try {

        const search =
            safeText(
                $("windowSearch")?.value
            ).toLowerCase();

        const status =
            safeText(
                $("statusFilter")?.value
            );

        const ageFilter =
            safeText(
                $("ageFilter")?.value
            ) || "all";

        const qcFilter =
            safeText(
                $("qcFilter")?.value
            ) || "all";

        const allocatedFilter =
            safeText(
                $("allocatedFilter")?.value
            ) || "all";

        const windows =
            getAllWindowsWithProject();

        const filtered =
            windows.filter(item => {

                const matchesSearch =
                    !search ||
                    safeText(item.windowNumber)
                        .toLowerCase()
                        .includes(search) ||
                    safeText(item.projectName)
                        .toLowerCase()
                        .includes(search) ||
                    safeText(item.windowLocation)
                        .toLowerCase()
                        .includes(search) ||
                    safeText(item.customerName)
                        .toLowerCase()
                        .includes(search) ||
                    safeText(item.projectName)
                        .toLowerCase()
                        .includes(search) ||
                    safeText(item.description)
                        .toLowerCase()
                        .includes(search) ||
                    safeText(item.frameColour)
                        .toLowerCase()
                        .includes(search) ||
                    safeText(item.glassType)
                        .toLowerCase()
                        .includes(search);

                const matchesStatus =
                    !status ||
                    status === "all" ||
                    item.status === status;

                /*
                   Age filter: lets the workshop pull up every
                   window that has passed a colour band, instead of
                   scrolling the whole list looking for red badges.
                */
                const days = daysSince(item.createdAt);
                const band = ageBand(days);

                let matchesAge = true;

                if (ageFilter === "overdue") {
                    matchesAge = band === "red";
                } else if (ageFilter === "attention") {
                    matchesAge = band === "yellow" || band === "red";
                } else if (ageFilter === "ontrack") {
                    matchesAge = band === "green";
                }

                /*
                   QC filter. "pending" also catches windows whose
                   QC field is empty, so nothing slips through.
                */
                const qcValue = safeText(item.qcCheck).toLowerCase();

                let matchesQc = true;

                if (qcFilter === "pass") {
                    matchesQc = qcValue === "pass";
                } else if (qcFilter === "fail") {
                    matchesQc = qcValue === "fail";
                } else if (qcFilter === "pending") {
                    matchesQc = qcValue !== "pass" && qcValue !== "fail";
                }

                /*
                   Allocation filter: a specific employee, or
                   anything not yet allocated.
                */
                const allocatedTo = safeText(item.allocatedTo);

                let matchesAllocated = true;

                if (allocatedFilter === "unallocated") {
                    matchesAllocated = !allocatedTo;
                } else if (allocatedFilter !== "all") {
                    matchesAllocated = allocatedTo === allocatedFilter;
                }

                return (
                    matchesSearch &&
                    matchesStatus &&
                    matchesAge &&
                    matchesQc &&
                    matchesAllocated
                );
            });

        /*
           Oldest first. The windows most likely to be a problem
           are the ones that have been waiting longest, so they
           belong at the top of the list.
        */
        filtered.sort((a, b) => {

            const aTime = new Date(a.createdAt).getTime();
            const bTime = new Date(b.createdAt).getTime();

            if (isNaN(aTime) && isNaN(bTime)) return 0;
            if (isNaN(aTime)) return 1;
            if (isNaN(bTime)) return -1;

            return aTime - bTime;
        });

        renderWindowsList(filtered);

    } catch (error) {

        console.error(
            "Filter error:",
            error
        );

        showError(
            "The window list could not be filtered."
        );
    }
}

/* =========================================================
   RENDER WINDOWS
   ========================================================= */

function renderWindowsList(
    windows = getAllWindowsWithProject()
) {

    const container =
        $("windowsList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!windows.length) {

        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon" aria-hidden="true">
                    <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M12 3v18M3 12h9"/></svg>
                </span>
                <h4>No windows captured yet</h4>
                <p>Windows are captured inside a project. Create your first project to start adding windows.</p>
            </div>
        `;

        return;
    }

    windows.forEach(item => {

        const card =
            document.createElement("div");

        card.className =
            "window-card";

        card.innerHTML = `
            <div class="window-card-header">
                <strong>
                    ${escapeHtml(item.description)}
                </strong>

                <span class="window-id-badge">
                    ${escapeHtml(item.windowNumber || formatWindowId(item.windowId) || "—")}
                </span>

                <span class="project-window-count">
                    ${escapeHtml(item.projectNumber)}
                </span>

                ${qcStatusPillHtml(item.qcCheck)}

                ${statusPillHtml(item.status)}

                ${ageBadgeHtml(item.createdAt)}
            </div>

            <div class="window-card-body">

                <p>
                    <strong>Type:</strong>
                    ${productTypeBadgeHtml(item.productType)}
                </p>

                <p>
                    <strong>Allocated To:</strong>
                    ${allocatedBadgeHtml(item.allocatedTo)}
                </p>

                <p>
                    <strong>Project:</strong>
                    ${escapeHtml(item.projectName)}
                </p>

                <p>
                    <strong>Customer:</strong>
                    ${escapeHtml(item.customerName)}
                </p>

                <p>
                    <strong>Created:</strong>
                    ${escapeHtml(formatCreatedDate(item.createdAt).replace(/^Created\s+/, ""))}
                </p>

                <p>
                    <strong>Location:</strong>
                    ${escapeHtml(item.location || "-")}
                </p>

                <p>
                    <strong>Length:</strong>
                    ${escapeHtml(item.length)} mm
                </p>

                <p>
                    <strong>Width:</strong>
                    ${escapeHtml(item.width)} mm
                </p>

                <p>
                    <strong>Frame Color:</strong>
                    ${escapeHtml(item.frameColour)}
                </p>

                <p>
                    <strong>Glass Type:</strong>
                    ${escapeHtml(item.glassType || "-")}
                </p>

                <p>
                    <strong>QC Check:</strong>
                    ${qcCheckBadgeHtml(item.qcCheck)}
                </p>

                <p class="window-card-photo-line">
                    <strong>Photo:</strong>
                    ${savedPhotoHtml(item.photo)}
                </p>

            </div>
        `;

        container.appendChild(card);
    });
}

/* =========================================================
   FLATTEN PROJECTS INTO WINDOWS
   =========================================================

   A window is now captured as a row inside a project, so the
   flat "all windows" list is derived rather than stored twice.
   Each derived window keeps a back-reference to its project so
   the source of truth stays the project record.
*/

function getAllWindowsWithProject() {

    const flat = [];

    getProjects().forEach(project => {

        (project.windows || []).forEach(window => {

            flat.push({
                projectId: project.id,
                projectNumber: project.projectNumber,
                projectName: project.projectName,
                customerName: project.customerName,
                siteAddress: project.siteAddress,

                /*
                   The promised date belongs to the project but is
                   shown on every window, because a window row is
                   where the workshop looks. Carried through the
                   flatten so callers do not each have to look the
                   project back up.
                */
                dueDate: project.dueDate || "",

                ...window
            });
        });
    });

    return flat;
}

/* =========================================================
   HTML ESCAPING
   ========================================================= */

function escapeHtml(value) {

    return safeText(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* =========================================================
   VIEW WINDOW (MODAL)
   ========================================================= */

function statusBadgeClass(status) {
    const map = {
        "Measured": "status-measured",
        "In Production": "status-production",
        "Frame Manufactured": "status-frame",
        "Glazed": "status-glazed",
        "Quality Checked": "status-quality",
        "Ready for Installation": "status-ready",
        "Installed": "status-installed",
        "Completed": "status-completed"
    };

    return map[status] || "status-measured";
}

function viewWindow(windowId) {

    try {

        if (!windowId) {
            throw new Error(
                "No window was selected."
            );
        }

        /*
           Windows are stored inside projects, so look there first.
           The flat getAllWindowsWithProject() list already merges in
           the owning project's details, which the production record
           needs (project and customer names in the sheet header).

           getWindows() is only a fallback for any window captured
           under the older, single-window flow.
        */
        const item =
            getAllWindowsWithProject().find(
                windowItem => windowItem.id === windowId
            ) ||
            getWindows().find(
                windowItem => windowItem.id === windowId
            );

        if (!item) {
            throw new Error(
                "Window not found."
            );
        }

        const title = $("modalWindowTitle");
        const content = $("modalWindowContent");

        if (title) {
            title.textContent =
                `${item.windowNumber || "Window"}  •  ${item.productType || item.windowType || "Window"}`;
        }

        if (content) {
            content.innerHTML = buildWindowDetailsHtml(item);
        }

        /*
           Generate the QR code inside the modal.
        */
        generateQRCode("modalQrCode", buildQRContent(item.id));

        const modal = $("windowModal");

        if (modal) {
            modal.classList.add("open");
            modal.setAttribute("aria-hidden", "false");
        }

    } catch (error) {

        console.error(
            "View window error:",
            error
        );

        showError(
            error.message ||
            "The window could not be displayed."
        );
    }
}

function buildWindowDetailsHtml(item) {

    const qrHtml = `<div class="modal-qr">
        <div id="modalQrCode" class="qr-box"></div>
        <span>Scan to update production status</span>
    </div>`;

    const productionHtml = buildProductionTrackerHtml(item);

    const historyHtml = (item.statusHistory || [])
        .slice()
        .reverse()
        .map(entry => {
            const when = new Date(entry.date);
            const dateStr = when.toLocaleDateString("en-ZA") +
                " " + when.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });

            const who = entry.employee
                ? `by ${escapeHtml(entry.employee)}`
                : "";

            return `<li>
                <span class="history-status">${escapeHtml(entry.status)}</span>
                <span class="history-meta">${dateStr} ${who}</span>
            </li>`;
        })
        .join("");

    return `
    <div class="window-details">

        <div class="details-top">
            <div class="details-block">
                <p><strong>Project:</strong> ${escapeHtml(item.projectName || "-")}</p>
                <p><strong>Customer:</strong> ${escapeHtml(item.customerName || "-")}</p>

                ${/*
                     A window captured in a project stores its type
                     under productType and its location under
                     location. The windowType/windowLocation names
                     belong to the retired single-window flow, so
                     both are checked to keep old records readable.
                  */ ""}
                <p><strong>Type:</strong> ${productTypeBadgeHtml(item.productType || item.windowType)}</p>
                <p><strong>Location:</strong> ${escapeHtml(item.location || item.windowLocation || "-")}</p>
                <p><strong>Allocated To:</strong> ${allocatedBadgeHtml(item.allocatedTo)}</p>
                ${item.allocatedAt
            ? `<p class="details-small">Allocated ${escapeHtml(formatCreatedDate(item.allocatedAt).replace(/^Created\s+/, ""))}</p>`
            : ""}

                ${/*
                     Days outstanding against the promised date.
                     A job with no due date shows nothing here rather
                     than a misleading green.
                  */ ""}
                ${item.dueDate
            ? `<p><strong>Due:</strong> ${escapeHtml(formatDueDate(item.dueDate))}
                            ${outstandingBadgeHtml(item.dueDate)}</p>`
            : ""}
            </div>
            <div class="details-block details-status">
                <span class="status-badge ${statusBadgeClass(item.status)}">${escapeHtml(item.status)}</span>
                <span class="qc-pill ${safeText(item.qcCheck).toLowerCase() === "pass" ? "qc-pill-pass" : (safeText(item.qcCheck).toLowerCase() === "fail" ? "qc-pill-fail" : "qc-pill-none")}">
                    ${item.qcCheck ? `QC ${escapeHtml(item.qcCheck)}` : "QC pending"}
                </span>
                ${item.manufacturedBy
            ? `<p class="details-small">Manufactured by: <strong>${escapeHtml(item.manufacturedBy)}</strong></p>`
            : ""}
                ${item.checkedBy
            ? `<p class="details-small">Quality checked by: <strong>${escapeHtml(item.checkedBy)}</strong></p>`
            : ""}
            </div>
        </div>

        <div class="details-specs">
            ${/* Sizes are stored as length/width in a project row. */ ""}
            <p><strong>Size:</strong> ${escapeHtml(item.length || "-")} mm long &nbsp;×&nbsp; ${escapeHtml(item.width || "-")} mm wide</p>
            <p><strong>Frame Colour:</strong> ${escapeHtml(item.frameColour || "-")}${item.customFrameColour ? ` (${escapeHtml(item.customFrameColour)})` : ""}${item.frameSeries ? ` • <strong>Series:</strong> ${escapeHtml(item.frameSeries)}` : ""}</p>
            <p><strong>Glass:</strong> ${escapeHtml(item.glassType || "-")}${item.glassThickness ? ` • Thickness: ${escapeHtml(item.glassThickness)}` : ""}</p>
            <p><strong>Created:</strong> ${escapeHtml(formatCreatedDate(item.createdAt).replace(/^Created\s+/, ""))} &nbsp; ${ageBadgeHtml(item.createdAt)}</p>
            ${item.notes ? `<p><strong>Notes:</strong> ${escapeHtml(item.notes)}</p>` : ""}
        </div>

        ${item.photo
            ? `<div class="details-photo"><img src="${item.photo}" alt="Window photo"></div>`
            : ""}

        ${qrHtml}

        <div class="details-actions">
            <button type="button" class="primary-button" onclick="printWindow('${item.id}')">Print Worksheet</button>
            <!--
               The label is the sticker that goes on the frame: number,
               QR and barcode only. Kept beside the worksheet button
               because this is where someone stands when they need it.
            -->
            <button type="button" class="secondary-button" onclick="printLabel('${item.id}')">Print Label</button>
        </div>

        <div class="details-production">
            <h3>Production Tracking</h3>
            ${productionHtml}
            <div class="production-history">
                <h4>Status history</h4>
                ${historyHtml
            ? `<ul class="history-list">${historyHtml}</ul>`
            : `<p class="details-small">No history yet.</p>`}
            </div>
        </div>
    </div>
    `;
}

function buildProductionTrackerHtml(item) {

    const employees = getEmployees();

    /*
       STATUS IS READ-ONLY HERE.

       A window's production status may only be advanced by scanning
       its QR code on the floor. That is what makes the record
       trustworthy: the status reflects a real physical step, and
       the productivity log credits whoever scanned it. These are
       therefore a progress display, not buttons.
    */
    const currentIndex = STATUSES.indexOf(item.status);

    const statusSteps = STATUSES.map((status, index) => {

        const isCurrent = status === item.status;
        const isDone = index < currentIndex;

        const cssClass = isCurrent
            ? "tracker-step tracker-step-current"
            : (isDone ? "tracker-step tracker-step-done" : "tracker-step");

        const mark = isCurrent ? "\u25cf" : (isDone ? "\u2713" : "\u25cb");

        return `<span class="${cssClass}" data-status="${escapeHtml(status)}">` +
            `<span class="tracker-step-mark" aria-hidden="true">${mark}</span> ` +
            `${escapeHtml(status)}</span>`;
    }).join("");

    const employeeOptions = `<option value="">Select employee</option>` + getEmployeeOptions();

    /*
       "Allocated To" is who is responsible for this window.
       It is separate from the employee below, who records the
       step being completed right now. Allocating does not move
       the window along or affect productivity - it just answers
       "whose job is this?".
    */
    const allocatedValue = safeText(item.allocatedToId);

    const allocatedOptions =
        `<option value="">Unallocated</option>` +
        employees.map(employee => {

            const selected = employee.id === allocatedValue
                ? " selected"
                : "";

            return `<option value="${escapeHtml(employee.id)}"${selected}>${escapeHtml(employee.name)}${employee.number ? ` (${escapeHtml(employee.number)})` : ""}</option>`;
        }).join("");

    const allocatedName = safeText(item.allocatedTo);

    return `
    <div class="production-tracker">

        <div class="tracker-allocation">
            <div class="tracker-employee-row">
                <label for="trackerAllocatedSelect">Allocated to</label>
                <div class="tracker-allocate-controls">
                    <select id="trackerAllocatedSelect" class="tracker-employee-select">${allocatedOptions}</select>
                    <button type="button" class="secondary-button"
                        onclick="saveAllocation('${escapeHtml(item.id)}')">
                        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
                        Save
                    </button>
                </div>
                <p class="tracker-hint" id="trackerAllocatedHint">
                    ${allocatedName
                        ? `Currently allocated to <strong>${escapeHtml(allocatedName)}</strong>.`
                        : "Not allocated to anyone yet."}
                </p>
            </div>
        </div>

        <div class="tracker-step-section">
            <h4 class="tracker-section-title">Production Progress</h4>

            <div class="tracker-steps-readonly">${statusSteps}</div>

            <div class="scan-required-note">
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/><rect x="7" y="7" width="4" height="4" rx="1"/><rect x="13" y="13" width="4" height="4" rx="1"/></svg>
                <span>To move this window to the next step, scan its QR code on the Dashboard and choose your name.</span>
            </div>

            <button type="button" class="primary-button tracker-scan-button"
                onclick="closeWindowModal(); switchView('scanner');">
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                Go to Scanner
            </button>
        </div>

        ${employees.length === 0
            ? `<p class="tracker-warning">No employees added yet. Add employees in the Team tab so windows can be allocated and steps assigned.</p>`
            : ""}
    </div>`;
}

/* =========================================================
   ALLOCATE A WINDOW
   =========================================================

   Writes the chosen employee onto the window record, then redraws
   so every view showing that window picks the change up.
*/
function saveAllocation(windowId) {

    const select = $("trackerAllocatedSelect");

    if (!select) {
        return false;
    }

    return applyAllocation(windowId, safeText(select.value), { reopen: true });
}

/*
   Allocate straight from a window row in the project list.

   Same rules as the modal, but the employee is read from the row's
   own select rather than "trackerAllocatedSelect". Allocating from
   the list is the common case on the floor: a supervisor is looking
   at every window at once and wants to hand them out without opening
   each record and coming back.
*/
function saveRowAllocation(windowId, selectElement) {

    const select = selectElement ||
        document.querySelector(`[data-row-allocated="${windowId}"]`);

    if (!select) {
        return false;
    }

    /* reopen:false the user stays on the list they are working through. */
    return applyAllocation(windowId, safeText(select.value), { reopen: false });
}

/*
   The shared body of both allocation paths.

   Deliberately takes the employee id rather than reading a control,
   so the caller decides where the choice came from and this stays the
   one place that writes the record, the queue entry and the toast.

   `reopen` controls whether the window record is reopened afterwards:
   the modal path wants that, the row path must NOT, or choosing a name
   from a row's dropdown would throw the user into the modal. The row
   just needs the list redrawn so the new owner shows.
*/
function applyAllocation(windowId, employeeId, options) {

    const reopen = Boolean(options && options.reopen);

    try {

        if (!windowId) {
            showError("No window was selected.");
            return false;
        }

        const employeeName = employeeId
            ? getEmployeeName(employeeId)
            : "";

        /*
           Guard against a stale id (an employee deleted since the
           window was allocated) silently writing a blank name.
        */
        if (employeeId && !employeeName) {
            showError("That employee could not be found. Please choose again.");
            return false;
        }

        const projects = getProjects();

        let found = false;

        projects.forEach(project => {

            (project.windows || []).forEach(window => {

                if (window.id !== windowId) {
                    return;
                }

                window.allocatedToId = employeeId;
                window.allocatedTo = employeeName;
                window.allocatedAt = employeeId
                    ? new Date().toISOString()
                    : "";

                found = true;
            });
        });

        if (!found) {
            showError("The selected window could not be found.");
            return false;
        }

        if (!saveProjects(projects)) {
            return false;
        }

        /*
           Allocation is its own small update, so two people
           allocating different windows at once do not clash.
        */
        if (typeof isBackendConfigured === "function" && isBackendConfigured()) {
            enqueue({
                type: "allocate",
                windowId,
                employeeId,
                employeeName
            });
        }

        showSuccess(
            employeeName
                ? `Window allocated to ${employeeName}.`
                : "Window allocation cleared."
        );

        renderAll();

        /*
           Only the modal path reopens the record. From a list row the
           user is working through many windows, so reopening would
           interrupt them on every single change.
        */
        if (reopen) {
            viewWindow(windowId);
        }

        return true;

    } catch (error) {

        console.error("Allocation error:", error);

        showError("The allocation could not be saved.");

        return false;
    }
}

window.saveAllocation = saveAllocation;

window.saveRowAllocation = saveRowAllocation;

window.applyAllocation = applyAllocation;

window.rowAllocationHtml = rowAllocationHtml;

/*
   "Allocated To" as a badge, for tables and cards.
*/
/*
   Row click handler. The row contains buttons (QR, photo), and a
   click on those must do its own thing rather than also opening
   the window record underneath it.
*/
function openWindowRow(event, windowId) {

    const target = event?.target;

    if (target && target.closest("button, a, input, select, textarea")) {
        return;
    }

    viewWindow(windowId);
}

window.openWindowRow = openWindowRow;

function allocatedBadgeHtml(allocatedTo) {

    const value = safeText(allocatedTo);

    if (!value) {
        return `<span class="allocated-badge allocated-none">Unallocated</span>`;
    }

    return `<span class="allocated-badge allocated-set" title="Allocated to ${escapeHtml(value)}">${escapeHtml(value)}</span>`;
}

/*
   The "Allocated" cell of a window row: a picker, not just a badge.

   Previously this cell only DISPLAYED who owned the window - changing
   it meant opening the record and using the tracker. On a job with
   thirty windows that is thirty open-and-close cycles to hand out the
   work, so the choice is made directly in the row here.

   The click handler stops the event from reaching the row, because the
   row itself opens the window record - without this, picking a name
   from the dropdown would also open the modal underneath it.
*/
function rowAllocationHtml(window) {

    const employees = getEmployees();

    /*
       With no team added there is nothing to choose from, so fall back
       to the plain badge rather than rendering an empty dropdown.
    */
    if (!employees.length) {
        return allocatedBadgeHtml(window.allocatedTo);
    }

    const allocatedValue = safeText(window.allocatedToId);

    const options = `<option value="">Unallocated</option>` +
        employees.map(employee => {

            const selected = employee.id === allocatedValue
                ? " selected"
                : "";

            return `<option value="${escapeHtml(employee.id)}"${selected}>${escapeHtml(employee.name)}${employee.number ? ` (${escapeHtml(employee.number)})` : ""}</option>`;
        }).join("");

    const currentName = safeText(window.allocatedTo);

    return `<div class="row-allocation" onclick="event.stopPropagation()">
        <select class="row-allocated-select" data-row-allocated="${escapeHtml(window.id)}"
            aria-label="Allocated to${currentName ? ` (currently ${escapeHtml(currentName)})` : ""}"
            onchange="saveRowAllocation('${escapeHtml(window.id)}', this)">${options}</select>
    </div>`;
}

function formatStatusForEmail(status) {
    return status;
}

window.statusBadgeClass = statusBadgeClass;
window.buildWindowDetailsHtml = buildWindowDetailsHtml;

window.buildProductionTrackerHtml = buildProductionTrackerHtml;

/* =========================================================
   CLOSE MODAL
   ========================================================= */

function closeWindowModal() {

    const modal =
        $("windowModal");

    if (modal) {
        modal.classList.remove("open");
    }

    /*
       Clearing the scan proof means a status can only be changed
       in the session immediately after scanning, not later by
       reopening a window record.
    */
    window.scannedWindowId = "";
}

/* =========================================================
   TRACKER STATUS CLICK
   ========================================================= */

function handleTrackerStatusClick(windowId, status) {
    const select = $("trackerEmployeeSelect");

    const employeeId = select?.value || "";

    const employeeName = getEmployeeName(employeeId);

    updateWindowStatus(windowId, status, employeeId, employeeName);
}

window.handleTrackerStatusClick = handleTrackerStatusClick;

/* =========================================================
   RENDER EMPLOYEES
   ========================================================= */

function renderEmployees() {

    const container =
        $("employeesList");

    if (!container) {
        return;
    }

    const employees =
        getEmployees();

    container.innerHTML = "";

    if (!employees.length) {

        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon" aria-hidden="true">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M21 20v-1.5a4 4 0 0 0-3-3.87M16 4.13a4 4 0 0 1 0 7.75"/></svg>
                </span>
                <h4>No employees yet</h4>
                <p>Add your workshop staff so each production step can be assigned to the person who completed it.</p>
            </div>
        `;

        return;
    }

    employees.forEach(employee => {

        const row =
            document.createElement("div");

        row.className =
            "employee-row";

        row.innerHTML = `
            <div class="employee-info">
                <strong>${escapeHtml(employee.name)}</strong>
                ${employee.number
                ? `<span>${escapeHtml(employee.number)}</span>`
                : ""}
            </div>
        `;

        container.appendChild(row);
    });
}

/* =========================================================
   RENDER PROJECTS
   =========================================================

   A project shows its own details once, then every window as a
   single table row:
       Description | Location | Length | Width | Frame Color
*/

/* =========================================================
   AGE / WAITING TIME
   =========================================================

   A project's age is measured from the day it was created.
   The colour tells the workshop how long a window has been
   waiting to be started:

        up to 10 days   green   - on track
        up to 20 days   yellow  - getting old, watch it
        over 20 days    red     - overdue, deal with it now
   The same three bands are used on every window row and on
   the project card, so the screen reads consistently.
*/

const AGE_GREEN_DAYS = 10;
const AGE_YELLOW_DAYS = 20;

/* =========================================================
   DAYS OUTSTANDING
   =========================================================
   How a job stands against the date the customer was promised.

   This is deliberately NOT the same figure as the age badge
   above. Age says how long a window has existed; this says
   whether the job is going to be late, which is the number a
   workshop actually manages against.

   The bands are the same 10/20 day shape as age so the two read
   consistently, but the meaning is different - they measure the
   approach to the due date, not time since creation.

        more than 10 days left   green   - comfortable
        up to 10 days left       yellow  - getting tight
        past the due date        red     - overdue
   ========================================================= */

const DUE_SOON_DAYS = 10;

/*
   Coerce anything to a yyyy-mm-dd string, or "".

   A date input only accepts that exact shape. A stored timestamp,
   or a date typed with slashes, would silently render as an empty
   box and look like the due date had been lost.
*/
function normaliseDueDate(value) {

    const text = safeText(value);

    if (!text) {
        return "";
    }

    /* Already the right shape. */
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return text;
    }

    const parsed = new Date(text);

    if (isNaN(parsed.getTime())) {
        return "";
    }

    /*
       Built from local parts, not toISOString(), which converts to
       UTC and can shift the day backwards for anyone ahead of it.
    */
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

/*
   Signed whole days between a due date and today.

      null      no due date, or an unreadable one
      positive  days OVERDUE  (the date has passed)
      zero      due today
      negative  days REMAINING (the date is still ahead)

   Signed rather than absolute because "5 days" is useless on its
   own - the caller cannot tell late from early.

   Calendar days, not 24-hour blocks, so a job due yesterday reads
   as 1 day overdue this morning rather than 0.
*/
function daysOutstanding(dueDate) {

    const normalised = normaliseDueDate(dueDate);

    if (!normalised) {
        return null;
    }

    /*
       Parsed as local midnight by passing the parts explicitly.
       new Date("2026-09-30") would be UTC midnight, which lands on
       the 29th for anyone west of Greenwich.
    */
    const parts = normalised.split("-").map(Number);

    const due = new Date(parts[0], parts[1] - 1, parts[2]);

    const now = new Date();

    const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    return Math.round((today - due) / 86400000);
}

/*
   The due-date badge, for a window row, a project line or the
   window record.

   A job with no due date gets NO badge rather than a grey "-1 days"
   or a misleading green, because "no promised date" is a real
   state and should not look like good news.
*/
function outstandingBadgeHtml(dueDate) {

    const days = daysOutstanding(dueDate);

    if (days === null) {
        return "";
    }

    let band;
    let label;

    if (days > 0) {
        band = "red";
        label = days === 1
            ? "1 day overdue"
            : `${days} days overdue`;

    } else if (days === 0) {
        band = "red";
        label = "Due today";

    } else {
        const left = Math.abs(days);

        band = left <= DUE_SOON_DAYS ? "yellow" : "green";
        label = left === 1 ? "1 day left" : `${left} days left`;
    }

    const dueText = new Date(
        Number(normaliseDueDate(dueDate).split("-")[0]),
        Number(normaliseDueDate(dueDate).split("-")[1]) - 1,
        Number(normaliseDueDate(dueDate).split("-")[2])
    ).toLocaleDateString("en-ZA", {
        day: "numeric", month: "short", year: "numeric"
    });

    return `<span class="age-badge age-${band}" ` +
        `title="Due ${escapeHtml(dueText)}">${escapeHtml(label)}</span>`;
}

/*
   Whole days between a stored timestamp and today. Returns null
   when there is no usable date, so callers can skip the badge
   rather than render a misleading "0 days".
*/
/*
   A due date as readable text, e.g. "30 Sep 2026".

   Parsed from its parts rather than passed straight to new Date(),
   which would read a yyyy-mm-dd string as UTC midnight and show the
   previous day for anyone west of Greenwich.
*/
function formatDueDate(dueDate) {

    const normalised = normaliseDueDate(dueDate);

    if (!normalised) {
        return "-";
    }

    const parts = normalised.split("-").map(Number);

    return new Date(parts[0], parts[1] - 1, parts[2])
        .toLocaleDateString("en-ZA", {
            day: "numeric", month: "short", year: "numeric"
        });
}

function daysSince(dateValue) {

    if (!dateValue) {
        return null;
    }

    const then = new Date(dateValue);

    if (isNaN(then.getTime())) {
        return null;
    }

    const now = new Date();

    /*
       Compare calendar days, not 24-hour blocks, so something
       captured yesterday evening reads as "1 day" this morning
       rather than "0 days".
    */
    const thenMidnight = new Date(
        then.getFullYear(),
        then.getMonth(),
        then.getDate()
    );

    const nowMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    const diff = nowMidnight - thenMidnight;

    return Math.max(0, Math.round(diff / 86400000));
}

/*
   Which band a number of days falls into.
*/
function ageBand(days) {

    if (days === null) {
        return null;
    }

    if (days <= AGE_GREEN_DAYS) {
        return "green";
    }

    if (days <= AGE_YELLOW_DAYS) {
        return "yellow";
    }

    return "red";
}

/*
   "Created 5 Aug 2026" - readable, day-first (South African
   convention), and stable across browsers.
*/
function formatCreatedDate(dateValue) {

    if (!dateValue) {
        return "-";
    }

    const date = new Date(dateValue);

    if (isNaN(date.getTime())) {
        return "-";
    }

    return `Created ${date.toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "short",
        year: "numeric"
    })}`;
}

/*
   The age badge: "5 days", colour-coded by band. The title text
   spells the rule out so nobody has to remember what red means.
*/
function ageBadgeHtml(dateValue) {

    const days = daysSince(dateValue);

    const band = ageBand(days);

    if (band === null) {
        return "";
    }

    const label = days === 0
        ? "Today"
        : (days === 1 ? "1 day" : `${days} days`);

    const explanation = band === "green"
        ? `Within ${AGE_GREEN_DAYS} days - on track`
        : (band === "yellow"
            ? `Over ${AGE_GREEN_DAYS} days - needs attention`
            : `Over ${AGE_YELLOW_DAYS} days - overdue`);

    return `<span class="age-badge age-${band}" title="${escapeHtml(explanation)}">${escapeHtml(label)}</span>`;
}

/*
   Status pill. Reuses the existing status-badge palette so a
   status reads the same here as it does in the window modal.
*/
function statusPillHtml(status) {

    const value = safeText(status) || "Measured";

    return `<span class="status-badge ${statusBadgeClass(value)}">${escapeHtml(value)}</span>`;
}

/*
   QC check as a pill, matching the shape of the status pill so the
   two read as a pair: what stage the window is at, and whether its
   quality check passed.

   A window can be quality checked as part of its normal flow, but
   the per-window QC field is filled in by the person on the floor
   and is independent of that - so it is shown separately.
*/
function qcStatusPillHtml(qcCheck) {

    const value = safeText(qcCheck);

    if (!value) {
        return `<span class="qc-pill qc-pill-none" title="No quality check recorded yet">QC pending</span>`;
    }

    const lower = value.toLowerCase();

    if (lower === "pass") {
        return `<span class="qc-pill qc-pill-pass" title="Quality check passed">QC pass</span>`;
    }

    if (lower === "fail") {
        return `<span class="qc-pill qc-pill-fail" title="Quality check failed - this window needs rework">QC fail</span>`;
    }

    return `<span class="qc-pill qc-pill-none">${escapeHtml(value)}</span>`;
}

/*
   A small line under the outstanding badge giving the actual date.

   The badge says "3 days left", which answers the urgent question
   but not "left until when?" - and someone on the phone to a
   customer needs the date, not an offset.
*/
function dueDateCaption(dueDate) {

    const normalised = normaliseDueDate(dueDate);

    if (!normalised) {
        return `<small class="age-date">No due date</small>`;
    }

    const parts = normalised.split("-").map(Number);

    const date = new Date(parts[0], parts[1] - 1, parts[2]);

    return `<small class="age-date">Due ${escapeHtml(date.toLocaleDateString("en-ZA", {
        day: "numeric", month: "short", year: "numeric"
    }))}</small>`;
}

function windowRowTableHtml(windows) {

    /*
       Rows open the window's production record when clicked, so
       the dashboard and project schedules can be used to allocate
       work without hunting for the QR button.
    */
    const rows = windows.map(window => `
        <tr data-window-id="${escapeHtml(window.id)}"
            class="clickable-window-row"
            tabindex="0"
            title="Open ${escapeHtml(window.windowNumber || "window")} record"
            onclick="openWindowRow(event, '${escapeHtml(window.id)}')"
            onkeydown="if(event.key==='Enter'){event.preventDefault();viewWindow('${escapeHtml(window.id)}');}">
            <td class="col-id"><span class="window-id-badge">${escapeHtml(window.windowNumber || formatWindowId(window.windowId) || "—")}</span></td>
            <td class="col-type">${productTypeBadgeHtml(window.productType)}</td>
            <td class="col-desc">${escapeHtml(window.description)}</td>
            <td class="col-loc">${escapeHtml(window.location)}</td>
            <td class="col-num">${escapeHtml(window.length)} mm</td>
            <td class="col-num">${escapeHtml(window.width)} mm</td>
            <td class="col-frame">${escapeHtml(window.frameColour)}</td>
            <td class="col-glass">${escapeHtml(window.glassType || "-")}</td>
            <td class="col-qc">${qcStatusPillHtml(window.qcCheck)}</td>
            <td class="col-status">${statusPillHtml(window.status)}</td>
            <td class="col-allocated">${rowAllocationHtml(window)}</td>
            <td class="col-age">
                <span class="age-stack">
                    ${ageBadgeHtml(window.createdAt)}
                    <small class="age-date">${escapeHtml(formatCreatedDate(window.createdAt))}</small>
                </span>
            </td>
            <td class="col-due">
                <span class="age-stack">
                    ${outstandingBadgeHtml(window.dueDate)}
                    ${dueDateCaption(window.dueDate)}
                </span>
            </td>
            <td class="saved-photo-cell col-photo">${savedPhotoHtml(window.photo)}</td>
            <td class="window-row-qr-cell col-qr">
                <button type="button" class="row-qr-button"
                    title="QR code for ${escapeHtml(window.windowNumber || "")} - click to enlarge"
                    onclick="openQRViewer(this)">
                    <span class="row-qr" data-qr-window="${escapeHtml(window.windowNumber || "")}" aria-hidden="true">
                        ${window.windowNumber ? "" : `<span class="qr-missing">No ID</span>`}
                    </span>
                </button>
            </td>
        </tr>
    `).join("");

    return `
        <div class="window-rows-wrapper">
            <table class="window-rows-table">
                <thead>
                    <tr>
                        <th class="col-id">Window ID</th>
                        <th class="col-type">Type</th>
                        <th class="col-desc">Description</th>
                        <th class="col-loc">Location</th>
                        <th class="col-num">Length</th>
                        <th class="col-num">Width</th>
                        <th class="col-frame">Frame Color</th>
                        <th class="col-glass">Glass</th>
                        <th class="col-qc">QC</th>
                        <th class="col-status">Status</th>
                        <th class="col-allocated">Allocated To</th>
                        <th class="col-age">Age</th>
                        <th class="col-due">Outstanding</th>
                        <th class="col-photo">Photo</th>
                        <th class="col-qr">QR Code</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

/*
   A saved window's photo: a small thumbnail that opens full size.
   The data URL is passed through escapeHtml so a crafted image
   URL cannot break out of the attribute.
*/
/*
   A saved window's QC result as a coloured badge.
*/
function qcCheckBadgeHtml(qcCheck) {

    const value = safeText(qcCheck);

    if (!value) {
        return `<span class="photo-none">Not checked</span>`;
    }

    const cssClass = value.toLowerCase() === "pass"
        ? "qc-badge qc-pass"
        : (value.toLowerCase() === "fail" ? "qc-badge qc-fail" : "qc-badge");

    return `<span class="${cssClass}">${escapeHtml(value)}</span>`;
}

function savedPhotoHtml(photo) {

    if (!photo) {
        return `<span class="photo-none">No photo</span>`;
    }

    return `<button type="button" class="saved-photo" title="View photo"
        onclick="openPhotoViewer(this)">
        <img src="${escapeHtml(photo)}" alt="Window photo">
    </button>`;
}

/*
   Project progress summary.

   Shows how many of a project's windows sit in each status, so a
   long job can be judged at a glance without reading every row.
   A window counts as NOT STARTED while it is still "Measured" -
   that is the state that drives the overdue colour.
*/
function projectStatusSummaryHtml(windows) {

    const total = windows.length;

    if (!total) {
        return `<span class="project-progress project-progress-empty">No windows</span>`;
    }

    const counts = {};

    windows.forEach(window => {
        const key = safeText(window.status) || "Measured";
        counts[key] = (counts[key] || 0) + 1;
    });

    /*
       "Measured" means captured but not yet worked on. Reporting
       it as "not started" is the number the workshop actually
       cares about when a project is running late.
    */
    const notStarted = counts["Measured"] || 0;
    const completed = (counts["Completed"] || 0) + (counts["Installed"] || 0);

    const chips = [];

    if (notStarted) {
        chips.push(`<span class="progress-chip chip-notstarted">${notStarted} not started</span>`);
    }

    if (completed) {
        chips.push(`<span class="progress-chip chip-done">${completed} done</span>`);
    }

    const others = total - notStarted - completed;

    if (others > 0) {
        chips.push(`<span class="progress-chip chip-inprogress">${others} in progress</span>`);
    }

    return `<span class="project-progress">${chips.join("")}</span>`;
}

/*
   The oldest unstarted window in a project decides the project's
   age colour. A job where everything has been built and shipped
   should not be flagged red just because it is old.
*/
function projectAgeHtml(project) {

    const windows = Array.isArray(project.windows) ? project.windows : [];

    const unstarted = windows.filter(
        window => (safeText(window.status) || "Measured") === "Measured"
    );

    /*
       With nothing outstanding, show the project's own age in the
       neutral green band - the job is not waiting on anybody.
    */
    if (unstarted.length === 0) {
        return windows.length
            ? `<span class="age-badge age-done" title="All windows have started production">Complete</span>`
            : "";
    }

    const oldest = unstarted.reduce((oldestSoFar, window) => {

        const value = new Date(window.createdAt).getTime();

        if (isNaN(value)) {
            return oldestSoFar;
        }

        return (oldestSoFar === null || value < oldestSoFar) ? value : oldestSoFar;

    }, null);

    return ageBadgeHtml(oldest === null ? project.createdAt : new Date(oldest).toISOString());
}

function renderProjects(
    projects = getProjects()
) {

    const container = $("projectsList");

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!projects.length) {

        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon" aria-hidden="true">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>
                </span>
                <h4>No projects yet</h4>
                <p>Create a project to capture all of its windows in one schedule.</p>
                <button type="button" class="primary-button" onclick="openNewProject()">
                    Create First Project
                </button>
            </div>
        `;

        return;
    }

    projects.forEach(project => {

        const windows = Array.isArray(project.windows)
            ? project.windows
            : [];

        const card = document.createElement("div");

        card.className = "project-card";

        card.innerHTML = `
            <div class="project-card-header">
                <div class="project-card-title">
                    <strong>${escapeHtml(project.projectName)}</strong>
                    <span class="project-number">${escapeHtml(project.projectNumber)}</span>
                </div>

                <div class="project-card-tags">
                    ${projectAgeHtml(project)}
                    <span class="project-window-count">
                        ${windows.length} window${windows.length === 1 ? "" : "s"}
                    </span>
                </div>
            </div>

            <div class="project-card-meta">
                <p><strong>Customer:</strong> ${escapeHtml(project.customerName)}</p>
                <p><strong>Phone:</strong> ${escapeHtml(project.customerPhone || "-")}</p>
                <p><strong>Email:</strong> ${escapeHtml(project.customerEmail || "-")}</p>
                <p><strong>Site:</strong> ${escapeHtml(project.siteAddress || "-")}</p>
                <p><strong>Created:</strong> ${escapeHtml(formatCreatedDate(project.createdAt).replace(/^Created\s+/, ""))}</p>
                <p><strong>Progress:</strong> ${projectStatusSummaryHtml(windows)}</p>
            </div>

            ${windows.length
                ? windowRowTableHtml(windows)
                : `<p class="details-small">No windows captured on this project.</p>`}

            <div class="window-card-actions">
                <button type="button" class="primary-button card-action"
                    onclick="editProject('${project.id}')">
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                    Edit Project
                </button>

                <button type="button" class="secondary-button card-action"
                    onclick="printProject('${project.id}')">
                    Print
                </button>

                <button type="button" class="secondary-button card-action"
                    onclick="emailProject('${project.id}')">
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>
                    Email
                </button>

                <!--
                   One label per window on the job, in a single print
                   job - the stickers that go on the frames themselves.
                   Only offered when there is something to label.
                -->
                ${windows.length
                    ? `<button type="button" class="secondary-button card-action"
                        onclick="printProjectLabels('${project.id}')">
                        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5v14"/><path d="M8 5v14"/><path d="M12 5v14"/><path d="M17 5v14"/><path d="M21 5v14"/></svg>
                        Print All Barcodes
                    </button>

                    <button type="button" class="secondary-button card-action"
                        title="Choose the sticker size for this printer"
                        onclick="openLabelSettings()">
                        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        Label Settings
                    </button>`
                    : ""}

                <button type="button" class="secondary-button card-action"
                    onclick="deleteProject('${project.id}')">
                    Delete
                </button>
            </div>
        `;

        container.appendChild(card);
    });

    /*
       Draw the per-window QR codes now that the rows exist in the DOM.
    */
    renderWindowRowQRCodes(container);
}

/*
   After a scan, bring the matched window into view and flash the
   row so it is obvious which one was scanned.
*/
function highlightProjectWindow(projectId, windowId) {

    /*
       Let the project list finish drawing before looking for the row.
    */
    setTimeout(() => {

        const row = document.querySelector(
            `[data-window-id="${CSS.escape(String(windowId))}"]`
        );

        if (!row) {
            return;
        }

        row.scrollIntoView({ block: "center", behavior: "smooth" });

        row.classList.add("window-row-highlight");

        setTimeout(() => {
            row.classList.remove("window-row-highlight");
        }, 2500);

    }, 350);
}

window.highlightProjectWindow = highlightProjectWindow;

function filterProjects() {

    try {

        const search = safeText(
            $("projectSearch")?.value
        ).toLowerCase();

        const projects = getProjects().filter(project => {

            if (!search) {
                return true;
            }

            const windowText = (project.windows || [])
                .map(window =>
                    `${window.description} ${window.location} ${window.frameColour} ${window.glassType} ${window.qcCheck}`
                )
                .join(" ")
                .toLowerCase();

            return (
                safeText(project.projectNumber).toLowerCase().includes(search) ||
                safeText(project.projectName).toLowerCase().includes(search) ||
                safeText(project.customerName).toLowerCase().includes(search) ||
                safeText(project.siteAddress).toLowerCase().includes(search) ||
                windowText.includes(search)
            );
        });

        renderProjects(projects);

    } catch (error) {

        console.error("Project filter error:", error);

        showError("The project list could not be filtered.");
    }
}

/* =========================================================
   DELETE PROJECT
   ========================================================= */

function deleteProject(projectId) {

    try {

        const projects = getProjects();

        const project = projects.find(item => item.id === projectId);

        if (!project) {
            showError("The project could not be found.");
            return;
        }

        const confirmed = confirm(
            `Delete project "${project.projectName}" and its ${(project.windows || []).length} window(s)?\n\nThis cannot be undone.`
        );

        if (!confirmed) {
            return;
        }

        const remaining = projects.filter(item => item.id !== projectId);

        if (!saveProjects(remaining)) {
            return;
        }

        showSuccess(`${project.projectNumber} deleted.`);

        renderAll();

    } catch (error) {

        console.error("Delete project error:", error);

        showError("The project could not be deleted.");
    }
}

/* =========================================================
   PRINT PROJECT SCHEDULE
   =========================================================

   Prints the whole project on one page: the project details
   followed by every window as a single row.
*/

function printProject(projectId) {

    try {

        const project = getProjects().find(
            item => item.id === projectId
        );

        if (!project) {
            showError("The project could not be found.");
            return;
        }

        const windows = Array.isArray(project.windows)
            ? project.windows
            : [];

        /*
           This is a SCHEDULE document: one sheet covering a whole
           project. The title block therefore carries the project
           number rather than an item number, and the detail grid
           describes the job rather than one item.

           .print-project hides the item-level rows in the detail
           grid. A project has no single size, type, location, frame
           or glass; those belong to each window and are already
           listed per item in the schedule below. See the markup
           comment in index.html for what that used to print.
        */
        const sheet = $("printWorksheet");

        if (sheet) {
            sheet.classList.add("print-project");
        }

        setPrintText("printWindowId", project.projectNumber);
        setPrintText("printProjectName", project.projectName);
        setPrintText("printProjectNameSub", project.customerName);

        setPrintText("printCustomerName", project.customerName);
        setPrintText("printSiteAddress", project.siteAddress);

        /*
           Contact: show the email and phone together, rather than
           mislabelling the phone number as a frame series.
        */
        const contact = [project.customerEmail, project.customerPhone]
            .map(value => safeText(value))
            .filter(Boolean)
            .join("  \u00b7  ");

        setPrintText("printCustomerContact", contact);

        /*
           Item-level fields describe the project as a whole here,
           because a schedule covers many items - saying "3 window(s)"
           in the Item Type row was misleading.
        */
        const types = [...new Set(
            windows.map(w => safeText(w.productType)).filter(Boolean)
        )];

        /*
           TYPE, LOCATION, FRAME, GLASS and ALLOCATION are all
           per-window facts, so a project cover does not print them.
           The schedule below lists every one of them against the item
           they belong to.

           They used to be collapsed into project-wide claims - the
           frame row printed "Charcoal +1 more", silently dropping the
           rest, on a sheet that goes to the customer. Clearing them
           rather than only hiding the rows means no misleading value
           exists in the document at all.
        */
        [
            "printWindowType",
            "printLocation",
            "printFrameColour",
            "printGlassType",
            "printAllocatedTo"
        ].forEach(id => setPrintText(id, ""));

        /*
           ITEM COUNT stays: "4 items" is a genuine project fact and
           the one thing the cover is actually for. It is already
           printed beside the schedule heading, so the block above is
           cleared to avoid stating it twice.
        */

        /*
           Summarise the specification instead of saying "See
           schedule" four times, which reads as a dodge on a sheet
           that goes to the customer.

           Distinct values are listed, capped so a job with fifteen
           colours does not blow the grid apart.
        */
        const distinct = (key) => [...new Set(
            windows.map(w => safeText(w[key])).filter(Boolean)
        )];

        /*
           Cap at TWO values rather than three. Three plus "+1 more"
           wrapped to a second line in the detail grid, which made
           that row taller than its neighbours.
        */
        const summarise = (values, emptyText) => {

            if (!values.length) {
                return emptyText;
            }

            if (values.length <= 2) {
                return values.join(", ");
            }

            return `${values.slice(0, 2).join(", ")} +${values.length - 2} more`;
        };

        /*
           Sizes, locations, frame colours and glass types were all
           summarised here and are no longer written at all - see the
           clear block above. The helpers that did it are kept off
           this path deliberately, so there is nothing left that can
           quietly reintroduce a project-wide claim.
        */

        /*
           The DISTINCT helpers were removed with the rows that used
           them. If a future cover needs a real project-level summary,
           read it back from these:

             types   distinct product types, computed above
             windows the full item list, with length/width/frame/glass
           Do NOT resurrect a "Size" row: a range across items under a
           heading that says "Size (mm)" reads as the project having
           one dimension, which is what this change removes.
        */

        /*
           Lengths and widths are still gathered, because the schedule
           below needs them per item and the item-count block uses the
           list length. They are simply not printed as a project size.
        */
        const lengths = windows
            .map(w => Number(w.length))
            .filter(n => Number.isFinite(n) && n > 0);

        const widths = windows
            .map(w => Number(w.width))
            .filter(n => Number.isFinite(n) && n > 0);

        const range = (values) => {

            if (!values.length) {
                return "\u2014";
            }

            const low = Math.min(...values);
            const high = Math.max(...values);

            return low === high ? `${low} mm` : `${low}\u2013${high} mm`;
        };

        /*
           A PROJECT HAS NO SIZE, so none is printed.

           This used to show the range across every window - "L 1200–
           2100 mm | W 900 mm" - under a heading reading "Size (mm)",
           which reads as the project having one dimension. It does
           not; each window does, and the schedule below lists them
           per item, which is the only place they belong.

           The fields are CLEARED rather than merely hidden by the
           .print-project rule, so no project size exists in the DOM
           for a later stylesheet change to resurrect.

           The same reasoning applies to type, location, frame, glass
           and allocation - see the block below.
        */
        ["printWidth", "printHeight"].forEach(id => setPrintText(id, ""));

        /*
           The pair separator belongs to a single item's "1200 \u00d7 900",
           so it is not shown on a schedule.
        */
        const dimSeparator = document.querySelector(".print-dim-sep");

        if (dimSeparator) {
            dimSeparator.hidden = true;
        }

        /*
           The ranges read as two facts, so they are separated by a
           middot rather than jammed together.
        */
        const dimCell = document.querySelector(".print-dim-cell");

        if (dimCell) {
            dimCell.classList.add("print-dim-ranging");
        }

        /*
           Allocation is per-window - "who is making this piece" - so
           it is not printed on a project cover. An earlier version
           listed every name against the project, which reads as the
           whole job being one person's.

           The schedule below shows it per item, which is the only
           place it means anything.
        */

        const qcCount = windows.filter(
            w => safeText(w.qcCheck).toLowerCase() === "pass"
        ).length;

        setPrintText(
            "printQcCheck",
            windows.length ? `${qcCount} of ${windows.length} passed` : "Not applicable"
        );

        /*
           Title-block status: the project's overall state, taken
           from its least-advanced item, so "not started" is visible
           rather than hidden behind a mixture.
        */
        const chip = $("printStatusChip");

        if (chip) {
            const notStarted = windows.filter(
                w => (safeText(w.status) || "Measured") === "Measured"
            ).length;

            chip.textContent = windows.length
                ? (notStarted
                    ? `${notStarted} of ${windows.length} not started`
                    : "Production started")
                : "No items";
        }

        /*
           The single-photo block is for ONE item. On a project
           sheet each window has its own photo, so that block is
           hidden and the photos are printed as a column in the
           schedule instead - see below.
        */
        const photoSection = $("printPhotoSection");

        if (photoSection) {
            photoSection.hidden = true;
        }

        /*
           Is there at least one photo on this job? If not, the
           photo column is left out entirely rather than printing a
           tall strip of empty boxes down the sheet.
        */
        const anyPhotos = windows.some(
            window => safeText(window.photo)
        );

        /*
           Columns across the table, for the empty-state colspan.

           Seven now, not thirteen: the schema is split over two rows
           per item (six + six) with the QR column spanning both, so
           the widest row is seven cells.
        */
        const columnCount = 7;

        /*
           Schedule: one item per pair of rows, with the columns the
           job actually needs - including allocation, QC and status.
        */
        const schedule = $("printSchedule");

        const photoHeader = document.querySelector("#printWorksheet th.c-photo");

        if (photoHeader) {
            photoHeader.hidden = !anyPhotos;
        }

        /*
           Two rows per item, matching the two heading rows in
           index.html. Every item contributes a pair of <tr>s and each
           pair is kept together by .print-item-pair, so a page break
           cannot land between an item's identity and its
           specification.
        */
        if (schedule) {
            schedule.innerHTML = windows.map(window => `
                <tbody class="print-item-pair">
                    <tr class="print-row-1">
                        <td class="c-id">${escapeHtml(window.windowNumber || formatWindowId(window.windowId) || "\u2014")}</td>
                        <td class="c-desc">${escapeHtml(window.description || "\u2014")}</td>
                        <td class="c-loc">${escapeHtml(window.location || "\u2014")}</td>
                        <td class="c-size">${escapeHtml(window.length)}</td>
                        <td class="c-size">${escapeHtml(window.width)}</td>
                        <td class="c-frame">${escapeHtml(formatPrintFrame(window.frameColour) || "\u2014")}</td>
                        <td class="c-barcode" rowspan="2"><span class="print-row-barcode" data-barcode-print="${escapeHtml(window.windowNumber || "")}"></span></td>
                        <td class="c-qr" rowspan="2"><span class="print-row-qr" data-qr-print="${escapeHtml(window.windowNumber || "")}"></span></td>
                    </tr>
                    <tr class="print-row-2">
                        <td class="c-type">${escapeHtml(window.productType || "\u2014")}</td>
                        <td class="c-glass">${escapeHtml(window.glassType || "\u2014")}</td>
                        <td class="c-who">${escapeHtml(window.allocatedTo || "Unallocated")}</td>
                        <td class="c-status">${escapeHtml(formatPrintStatus(window.status))}</td>
                        <td class="c-qc">${escapeHtml(formatPrintQc(window.qcCheck))}</td>
                        <td class="c-photo"${anyPhotos ? "" : " hidden"}>${printRowPhotoHtml(window.photo)}</td>
                    </tr>
                </tbody>
            `).join("") || `<tbody><tr><td colspan="${columnCount}" class="print-empty">No items captured on this project.</td></tr></tbody>`;

            renderPrintQRCodes(schedule);
            renderPrintBarcodes(schedule);
        }

        setPrintText("printScheduleCount", `${windows.length} item${windows.length === 1 ? "" : "s"}`);

        /*
           Notes: an empty box is correct here - the workshop writes
           in it by hand. Passing "" with no fallback keeps it blank
           rather than printing a stray dash.
        */
        const notesBox = $("printNotes");

        if (notesBox) {
            notesBox.textContent = "";
        }

        setPrintText(
            "printDate",
            new Date().toLocaleDateString("en-ZA", {
                day: "numeric", month: "short", year: "numeric"
            })
        );

        /*
           Sign-off names: these are written by hand on the floor, so
           they stay blank. Passing "" WITHOUT the dash fallback is
           what stops a stray "-" printing under the label.
        */
        const manufacturerCell = $("printManufacturer");
        const employeeCell = $("printEmployee");

        if (manufacturerCell) {
            manufacturerCell.textContent = "";
        }

        if (employeeCell) {
            employeeCell.textContent = "";
        }

        setPrintGenerated("printGenerated");

        generateQRCode("printQRCode", buildProjectQRContent(project.id));

        setTimeout(() => {
            window.print();
        }, 250);

    } catch (error) {

        console.error("Print project error:", error);

        showError("The project could not be printed.");
    }
}

/* =========================================================
   EMAIL PROJECT
   ---------------------------------------------------------
   The Email button on a project sends the project details AND
   the project worksheet to the office (Tiffany and Jan).

   Two paths, chosen automatically:

     * If the mail backend is configured, the message is sent
       server-side - no mail client needed, works on a phone -
       with the worksheet attached as a file, and the schedule
       repeated in the body so it can be read without opening the
       attachment.
     * If not, a mailto: draft is opened in the device's own
       mail app, so the button is never a dead end while the
       backend is still being set up.

   IMPORTANT: mailto: cannot carry an attachment - that is a
   limitation of the protocol, not of this code. On fallback
   path the worksheet is therefore NOT attached; the user is told
   plainly that the mail app has no attachment and that the
   attached worksheet is only available once the mailer is set up.
*/
async function emailProject(projectId) {

    try {

        const project = getProjects().find(
            item => item.id === projectId
        );

        if (!project) {
            showError("The project could not be found.");
            return;
        }

        const windows = Array.isArray(project.windows)
            ? project.windows
            : [];

        const session =
            typeof getSession === "function" ? getSession() : null;

        const recipients = Array.isArray(window.OFFICE_RECIPIENTS)
            ? window.OFFICE_RECIPIENTS
            : [];

        /*
           The project worksheet travels with the message.

           Built here rather than inside email.js so a failure to
           build it can never stop the email itself: a message
           without its attachment is far better than no message.
        */
        let attachments = [];

        if (typeof buildWorksheetAttachment === "function") {
            try {
                attachments = buildWorksheetAttachment(project);
            } catch (worksheetError) {
                console.error(
                    "Project worksheet could not be built:",
                    worksheetError
                );
            }
        }

        /*
           Try the backend first. A false result means no mailer is
           configured OR it failed, and either way we fall back to a
           mail draft rather than leaving the user with nothing.
        */
        let sent = false;

        if (typeof sendNewProjectEmail === "function") {

            showSuccess(
                `Sending ${project.projectNumber} to the office...`
            );

            sent = await sendNewProjectEmail(
                project,
                session?.name || "",
                attachments
            );
        }

        if (sent) {
            showSuccess(
                attachments.length
                    ? `${project.projectNumber} and its worksheet emailed to the office.`
                    : `${project.projectNumber} emailed to the office (no worksheet could be attached).`
            );
            return;
        }

        /*
           Fallback: open a pre-filled draft in the device's mail
           app. Kept short and plain - mailto bodies are not HTML.
        */
        const to = recipients.join(",");

        const subject =
            `Project ${project.projectNumber} \u2014 ${project.projectName}`;

        const lines = [`Project: ${project.projectNumber}`]
            .concat(project.projectName ? [`Name: ${project.projectName}`] : [])
            .concat(project.customerName ? [`Customer: ${project.customerName}`] : [])
            .concat(project.customerEmail ? [`Email: ${project.customerEmail}`] : [])
            .concat(project.customerPhone ? [`Phone: ${project.customerPhone}`] : [])
            .concat(project.siteAddress ? [`Site: ${project.siteAddress}`] : [])
            .concat([``, `Windows: ${windows.length}`])
            .concat(windows.map(window =>
                `- ${window.windowNumber || window.id}: ` +
                `${window.description || ""}` +
                (window.length || window.width
                    ? ` (${window.length || "-"} \u00d7 ${window.width || "-"} mm)`
                    : "")
            ));

        const href =
            `mailto:${encodeURIComponent(to)}` +
            `?subject=${encodeURIComponent(subject)}` +
            `&body=${encodeURIComponent(lines.join("\n"))}`;

        window.location.href = href;

        /*
           Say what actually happened. The worksheet is NOT on this
           draft, and pretending otherwise would have someone
           believe they had sent it.
        */
        showSuccess(
            "Opened your mail app with the project details. " +
            (attachments.length
                ? "Your mail app cannot attach the worksheet - use Print Worksheet to send it separately."
                : "")
        );

    } catch (error) {

        console.error("Email project error:", error);

        showError("The project could not be emailed.");
    }
}

window.emailProject = emailProject;

/*
   Project QR codes open this app with ?project=PROJECT-ID.
*/
function buildProjectQRContent(projectId) {
    const base = window.location.href.split("#")[0].split("?")[0];
    return `${base}?project=${encodeURIComponent(projectId)}`;
}

window.printProject = printProject;
window.deleteProject = deleteProject;

/* =========================================================
   DASHBOARD
   ========================================================= */

function renderDashboard() {

    const windows =
        getAllWindowsWithProject();

    const counts = {};

    STATUSES.forEach(status => {
        counts[status] = 0;
    });

    windows.forEach(item => {

        if (counts[item.status] !== undefined) {
            counts[item.status]++;
        }
    });

    /*
       Only update elements that actually exist.
    */

    setTextIfExists(
        "totalWindows",
        windows.length
    );

    /*
       Project total. A project holds one or more windows, so this
       is reported next to the window count.
    */
    setTextIfExists(
        "totalProjects",
        getProjects().length
    );

    setTextIfExists(
        "measuredWindows",
        counts["Measured"]
    );

    setTextIfExists(
        "productionWindows",
        counts["In Production"] +
        counts["Frame Manufactured"] +
        counts["Glazed"] +
        counts["Quality Checked"]
    );

    setTextIfExists(
        "readyWindows",
        counts["Ready for Installation"] +
        counts["Installed"] +
        counts["Completed"]
    );

    /*
       Production pipeline counts.
    */

    setTextIfExists(
        "pipelineMeasured",
        counts["Measured"]
    );

    setTextIfExists(
        "pipelineProduction",
        counts["In Production"] +
        counts["Frame Manufactured"] +
        counts["Glazed"] +
        counts["Quality Checked"]
    );

    setTextIfExists(
        "pipelineReady",
        counts["Ready for Installation"]
    );

    setTextIfExists(
        "pipelineInstalled",
        counts["Installed"]
    );

    setTextIfExists(
        "pipelineCompleted",
        counts["Completed"]
    );
}

function setTextIfExists(id, value) {

    const element = $(id);

    if (element) {
        element.textContent =
            safeText(value);
    }
}

/* =========================================================
   DASHBOARD: PROJECTS + WINDOWS TABLES
   =========================================================

   Table 1 lists every project. Clicking a project loads its
   windows into table 2 underneath, so the dashboard answers
   "what is in this job?" without leaving the page.
*/

/* Which project is currently expanded in table 2. */
let dashboardSelectedProjectId = null;

/*
   Select a project (or collapse it if clicked again) and redraw
   both tables.
*/
function selectDashboardProject(projectId) {

    dashboardSelectedProjectId =
        dashboardSelectedProjectId === projectId
            ? null
            : projectId;

    renderDashboardProjects();
    renderDashboardWindows();
}

window.selectDashboardProject = selectDashboardProject;

function renderDashboardProjects() {

    const container = $("dashboardProjects");

    if (!container) {
        return;
    }

    const projects = getProjects();

    if (!projects.length) {

        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon" aria-hidden="true">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>
                </span>
                <h4>No projects yet</h4>
                <p>Create your first project to start capturing windows and doors.</p>
                <button type="button" class="primary-button" onclick="openNewProject()">
                    Create First Project
                </button>
            </div>
        `;

        return;
    }

    /*
       Newest first, so the job just captured is at the top.
    */
    const ordered = [...projects].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const rows = ordered.map(project => {

        const windows = Array.isArray(project.windows)
            ? project.windows
            : [];

        const doors = windows.filter(w => isDoorType(w.productType)).length;
        const panes = windows.length - doors;

        const isSelected = project.id === dashboardSelectedProjectId;

        /*
           A compact make-up: how many windows and doors are in
           this job, which is the thing a supervisor looks for.
        */
        const mix = [];
        if (panes) mix.push(`${panes} window${panes === 1 ? "" : "s"}`);
        if (doors) mix.push(`${doors} door${doors === 1 ? "" : "s"}`);

        return `
            <tr class="dashboard-project-row${isSelected ? " selected" : ""}"
                data-project-id="${escapeHtml(project.id)}"
                onclick="selectDashboardProject('${project.id}')"
                tabindex="0"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectDashboardProject('${project.id}');}">
                <td class="col-edit-cell">
                    <button type="button" class="icon-button edit-icon-button"
                        title="Edit ${escapeHtml(project.projectName)}"
                        aria-label="Edit project"
                        onclick="event.stopPropagation();editProject('${project.id}')">
                        <svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                    </button>
                </td>
                <td class="col-expand" aria-hidden="true">
                    <svg class="icon chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>
                </td>
                <td class="col-prj">
                    <strong>${escapeHtml(project.projectName)}</strong>
                    <small>${escapeHtml(project.projectNumber)}</small>
                </td>
                <td class="col-cust">${escapeHtml(project.customerName)}</td>
                <td class="col-count">${mix.length ? mix.join(" &middot; ") : "0 items"}</td>
                <td class="col-age">${projectAgeHtml(project)}</td>
                <td class="col-prog">${projectStatusSummaryHtml(windows)}</td>
            </tr>
        `;
    }).join("");

    container.innerHTML = `
        <div class="window-rows-wrapper">
            <table class="window-rows-table dashboard-projects-table">
                <thead>
                    <tr>
                        <th class="col-expand" aria-label="Expand"></th>
                        <th class="col-edit-cell" aria-label="Actions"></th>
                        <th class="col-prj">Project</th>
                        <th class="col-cust">Customer</th>
                        <th class="col-count">Contains</th>
                        <th class="col-age">Age</th>
                        <th class="col-prog">Progress</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

/*
   Table 2: the windows and doors inside the selected project.
*/
function renderDashboardWindows() {

    const container = $("dashboardWindows");
    const title = $("dashboardWindowsTitle");
    const note = $("dashboardWindowsNote");

    if (!container) {
        return;
    }

    const project = getProjects().find(
        item => item.id === dashboardSelectedProjectId
    );

    if (!project) {

        if (title) {
            title.textContent = "Windows & Doors";
        }

        if (note) {
            note.textContent = "Select a project above";
        }

        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon" aria-hidden="true">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>
                </span>
                <h4>No project selected</h4>
                <p>Click a project in the table above to see every window and door in that job.</p>
            </div>
        `;

        return;
    }

    const windows = Array.isArray(project.windows)
        ? project.windows
        : [];

    if (title) {
        title.textContent = project.projectName;
    }

    if (note) {
        note.textContent = `${project.projectNumber} \u00b7 ${windows.length} item${windows.length === 1 ? "" : "s"}`;
    }

    if (!windows.length) {

        container.innerHTML = `<p class="details-small">No windows or doors captured on this project.</p>`;

        return;
    }

    /*
       Reuse the shared project window table so the dashboard and
       the Projects tab show identical detail, including status,
       QC and age.
    */
    container.innerHTML = windowRowTableHtml(windows);

    renderWindowRowQRCodes(container);
}

/* =========================================================
   RENDER EVERYTHING
   ========================================================= */

function renderAll() {

    try {

        renderDashboard();
        renderDashboardProjects();
        renderDashboardWindows();
        renderProjects();
        renderWindowsList();
        renderEmployees();
        renderScanEmployeeOptions();
        renderAllocatedFilterOptions();
        renderProductivity();

        /*
           The quote builder lives in its own module and may
           not be loaded (or may fail to load) - guard it so a
           quote problem can never blank the production views.
        */
        if (typeof window.renderQuotes === "function") {
            window.renderQuotes();
        }

    } catch (error) {

        console.error(
            "Render error:",
            error
        );

        showError(
            "Some information could not be displayed."
        );
    }
}

/* =========================================================
   QR CODE GENERATION
   ========================================================= */

function generateQRCode(containerId, text) {

    try {

        if (!text) {
            throw new Error(
                "No content was provided for the QR code."
            );
        }

        const element =
            $(containerId);

        if (!element) {
            console.warn(
                `QR code element "${containerId}" not found.`
            );

            return;
        }

        if (
            typeof QRCode ===
            "undefined"
        ) {

            throw new Error(
                "QR code library is not loaded."
            );
        }

        element.innerHTML = "";

        new QRCode(element, {
            text,
            width: 180,
            height: 180,
            correctLevel: QRCode.CorrectLevel.M
        });

    } catch (error) {

        console.error(
            "QR generation error:",
            error
        );

        showError(
            "The QR code could not be generated."
        );
    }
}

/*
   The QR code content is a URL that opens this app
   with the window selected. Scanning on a phone with
   the default camera app opens the production record.
*/
function buildQRContent(windowId) {
    const base = window.location.href.split("#")[0];
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}window=${encodeURIComponent(windowId)}`;
}

/*
   QR content for a window, keyed on its human-readable window
   number so a scan can be matched straight back to the ID printed
   on the worksheet.
*/
function buildWindowIdQRContent(windowNumber) {
    const base = window.location.href.split("#")[0].split("?")[0];
    return `${base}?w=${encodeURIComponent(windowNumber)}`;
}

/*
   Same as generateQRCode, but takes an element (or a selector)
   instead of an id, so it can draw a QR into every table row.
*/
function generateQRCodeInElement(element, text, size = 120) {

    try {

        if (!text) {
            return false;
        }

        const node = typeof element === "string"
            ? document.querySelector(element)
            : element;

        if (!node) {
            return false;
        }

        if (typeof QRCode === "undefined") {
            return false;
        }

        node.innerHTML = "";

        new QRCode(node, {
            text,
            width: size,
            height: size,
            correctLevel: QRCode.CorrectLevel.M
        });

        return true;

    } catch (error) {

        console.error("Row QR generation error:", error);

        return false;
    }
}

/*
   Draw the QR codes for every window row of a freshly rendered
   project list. Called after the markup is in the DOM because a
   QR code needs a real element to render into.
*/
/*
   QR codes for the printed window schedule. Printed slightly
   smaller so the schedule still fits on one page.
*/
function renderPrintQRCodes(scope) {

    const root = scope || document;

    root.querySelectorAll('[data-qr-print]').forEach(node => {

        const value = node.dataset.qrPrint;

        if (!value) {
            return;
        }

        /*
           Rendered at 200px, not 64px.

           The QR is printed at 24mm (see .print-row-qr in the print
           stylesheet). The old 64px canvas was being scaled up about
           14x to fill a 24mm square, so the printed modules were soft
           and a phone camera struggled to resolve them - and a QR code
           only has to be a little blurry to stop scanning.

           200px over 24mm is about 210dpi: sharp enough that the print
           is limited by the printer, not by this canvas, while staying
           small enough to keep the worksheet HTML light. The canvas is
           sized by CSS for display, so this only affects fidelity.
        */
        generateQRCodeInElement(
            node,
            buildWindowIdQRContent(value),
            200
        );
    });
}

function renderWindowRowQRCodes(scope) {

    const root = scope || document;

    root.querySelectorAll('[data-qr-window]').forEach(node => {

        const value = node.dataset.qrWindow;

        if (!value || node.dataset.qrDone === "1") {
            return;
        }

        const drawn = generateQRCodeInElement(
            node,
            buildWindowIdQRContent(value),
            100
        );

        if (drawn) {
            node.dataset.qrDone = "1";
        }
    });
}

/* =========================================================
   1D BARCODE
   ---------------------------------------------------------
   A Code 128 barcode of the window number, printed beside the
   QR code.

   Why both: a phone camera reads the QR, but a handheld laser
   scanner on the floor cannot read a QR at all - it only reads
   the striped symbology. Carrying both means whichever reader
   the workshop owns, the item can be identified.

   Code 128 (not Code 39) because it is denser and the whole
   alphanumeric window number fits in far less width, which
   matters on a schedule where every item only gets one narrow
   column.
========================================================= */

/*
   The value encoded in the barcode.

   Deliberately the SAME window number the QR carries, not the
   internal uuid: the number is what is printed in the ID column
   and written on the paperwork, so a scan can be matched to the
   sheet by eye as well as by machine.
*/
function buildWindowBarcodeValue(windowNumber) {
    return safeText(windowNumber);
}

/*
   Draw one barcode into an element. Mirrors
   generateQRCodeInElement so the row and print paths behave the
   same way, including failing quietly when the library is absent.
*/
function generateBarcodeInElement(element, value, height = 40) {

    try {

        if (!value) {
            return false;
        }

        const node = typeof element === "string"
            ? document.querySelector(element)
            : element;

        if (!node) {
            return false;
        }

        /*
           If the CDN did not load, show nothing rather than a
           broken image. The QR still identifies the item, so a
           missing barcode must not break the worksheet.
        */
        if (typeof JsBarcode === "undefined") {
            return false;
        }

        node.innerHTML = "";

        const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg"
        );

        node.appendChild(svg);

        JsBarcode(svg, value, {
            format: "CODE128",
            height,
            width: 2,
            displayValue: true,
            fontSize: 14,
            margin: 0
        });

        return true;

    } catch (error) {

        /*
           JsBarcode throws on a value it cannot encode. A window
           number should always encode, but a malformed one must
           not take the whole worksheet down.
        */
        console.error("Row barcode generation error:", error);

        return false;
    }
}

/*
   Barcodes for the printed window schedule, drawn after the
   markup is in the DOM.
*/
function renderPrintBarcodes(scope) {

    const root = scope || document;

    root.querySelectorAll('[data-barcode-print]').forEach(node => {

        const value = node.dataset.barcodePrint;

        if (!value) {
            return;
        }

        generateBarcodeInElement(node, value, 40);
    });
}

window.buildWindowBarcodeValue = buildWindowBarcodeValue;

window.generateBarcodeInElement = generateBarcodeInElement;

window.renderPrintBarcodes = renderPrintBarcodes;

/* =========================================================
   QR SCANNER
   ========================================================= */

let html5QrCode = null;

async function startScanner() {

    try {

        /*
           The employee gate. No scan is accepted until we know
           who is doing the work, so every completed step can be
           credited to a real person on the productivity dashboard.
        */
        const employeeId = safeText($("scanEmployeeSelect")?.value);

        if (!getEmployees().length) {

            showError(
                "Add your workshop team on the Team tab before scanning work."
            );

            return;
        }

        if (!employeeId) {

            showError(
                "Please select your name before scanning."
            );

            updateScanGateState();

            return;
        }

        if (
            typeof Html5Qrcode ===
            "undefined"
        ) {

            throw new Error(
                "QR scanner library is not loaded."
            );
        }

        const reader =
            $("qr-reader");

        if (!reader) {
            throw new Error(
                "QR scanner area is missing."
            );
        }

        if (html5QrCode) {
            return;
        }

        html5QrCode =
            new Html5Qrcode(
                "qr-reader"
            );

        await html5QrCode.start(

            {
                facingMode: "environment"
            },

            {
                fps: 10,
                qrbox: {
                    width: 250,
                    height: 250
                }
            },

            decodedText => {

                handleScannedQRCode(
                    decodedText
                );
            },

            errorMessage => {

                /*
                   Scanner produces frequent
                   "not found" messages while
                   looking for a QR code.

                   Don't display those as errors.
                */
            }
        );

        setTextIfExists(
            "scannerMessage",
            "Scanner active. Point the camera at a window QR code."
        );

    } catch (error) {

        console.error(
            "Scanner start error:",
            error
        );

        html5QrCode = null;

        showError(
            "The QR scanner could not be started. Please allow camera access."
        );
    }
}

/* =========================================================
   STOP SCANNER
   ========================================================= */

async function stopScanner() {

    try {

        if (!html5QrCode) {
            return;
        }

        await html5QrCode.stop();

        await html5QrCode.clear();

        html5QrCode = null;

        setTextIfExists(
            "scannerMessage",
            "Scanner stopped."
        );

    } catch (error) {

        console.error(
            "Scanner stop error:",
            error
        );

        html5QrCode = null;
    }
}

/* =========================================================
   SCANNER: FIND A WINDOW BY TEXT
   =========================================================

   The same outcome as a scan, without the camera. Typing a window
   ID, project, customer or location finds the window and opens its
   production record, and - because this is how the workshop gets
   there without a QR code - it grants the same permission to change
   status that a real scan does.

   The employee gate still applies: a name must be chosen first, so
   every completed step is still credited to a person.
*/

let scanSearchMatches = [];

function renderScanSearch() {

    const input = $("scanSearchInput");
    const results = $("scanSearchResults");
    const hint = $("scanSearchHint");
    const clearButton = $("scanSearchClearButton");

    if (!input || !results) {
        return;
    }

    const query = safeText(input.value).toLowerCase();

    if (clearButton) {
        clearButton.hidden = !query;
    }

    if (!query) {

        results.hidden = true;
        results.innerHTML = "";
        scanSearchMatches = [];

        if (hint) {
            hint.textContent = "Type part of a window ID, project, customer or location to find the window without the camera.";
        }

        return;
    }

    scanSearchMatches = getAllWindowsWithProject().filter(item => {

        return (
            safeText(item.windowNumber).toLowerCase().includes(query) ||
            safeText(item.projectNumber).toLowerCase().includes(query) ||
            safeText(item.projectName).toLowerCase().includes(query) ||
            safeText(item.customerName).toLowerCase().includes(query) ||
            safeText(item.location).toLowerCase().includes(query) ||
            safeText(item.description).toLowerCase().includes(query) ||
            safeText(item.productType).toLowerCase().includes(query) ||
            safeText(item.allocatedTo).toLowerCase().includes(query)
        );
    });

    /*
       Cap the list so a broad search ("window") stays readable on
       a phone; the count tells the user there are more.
    */
    const MAX_SHOWN = 25;

    const shown = scanSearchMatches.slice(0, MAX_SHOWN);

    if (hint) {
        hint.textContent = scanSearchMatches.length
            ? `${scanSearchMatches.length} window${scanSearchMatches.length === 1 ? "" : "s"} found. Select one to open it.`
            : "No windows match that search.";
    }

    if (!shown.length) {
        results.hidden = false;
        results.innerHTML = `<p class="details-small">No windows match "${escapeHtml(input.value)}".</p>`;
        return;
    }

    results.hidden = false;

    results.innerHTML = shown.map((item, index) => `
        <button type="button" class="scan-result" data-scan-index="${index}">
            <span class="scan-result-main">
                <strong>${escapeHtml(item.windowNumber || "-")}</strong>
                <small>${escapeHtml(item.description || "")}${item.location ? ` \u00b7 ${escapeHtml(item.location)}` : ""}</small>
            </span>
            <span class="scan-result-meta">
                ${productTypeBadgeHtml(item.productType)}
                ${statusPillHtml(item.status)}
            </span>
            <span class="scan-result-project">${escapeHtml(item.projectNumber || "")}</span>
        </button>
    `).join("") + (scanSearchMatches.length > MAX_SHOWN
        ? `<p class="details-small scan-more-note">Showing the first ${MAX_SHOWN}. Narrow the search to see more.</p>`
        : "");

    /*
       Attach handlers directly rather than inline onclick, so the
       window list is never interpolated into executable markup.
    */
    results.querySelectorAll("[data-scan-index]").forEach(button => {

        button.addEventListener("click", () => {

            const item = scanSearchMatches[Number(button.dataset.scanIndex)];

            if (item) {
                openWindowFromSearch(item);
            }
        });
    });
}

/*
   Open a window chosen from the search list.

   Mirrors handleScannedQRCode: the employee gate is enforced, the
   scan proof is set for THIS window, and the production record is
   opened so the next tap is the completed step.
*/
function openWindowFromSearch(item) {

    try {

        const employeeId = safeText($("scanEmployeeSelect")?.value);

        if (!getEmployees().length) {

            showError("Add your workshop team on the Team tab before recording work.");

            return;
        }

        if (!employeeId) {

            showError("Please select your name before opening a window.");

            updateScanGateState();

            return;
        }

        const employeeName = getEmployeeName(employeeId);

        window.scannedEmployeeId = employeeId;
        window.scannedEmployeeName = employeeName;

        /* Same proof a QR scan sets - this window may now be moved. */
        window.scannedWindowId = item.id;
        window.scannedWindow = item;

        showSuccess(
            `${item.windowNumber || item.description || "Window"} found for ${employeeName}.`
        );

        /* Clear the search so the view is ready for the next job. */
        const input = $("scanSearchInput");

        if (input) {
            input.value = "";
            renderScanSearch();
        }

        stopScanner();

        switchView("projects");

        if (item.projectId) {
            highlightProjectWindow(item.projectId, item.id);
        }

        viewWindow(item.id);

    } catch (error) {

        console.error("Scan search open error:", error);

        showError("The selected window could not be opened.");
    }
}

/* =========================================================
   HANDLE QR CODE
   ========================================================= */

function handleScannedQRCode(decodedText) {

    try {

        const code =
            safeText(decodedText);

        if (!code) {
            showError(
                "The QR code did not contain any information."
            );

            return;
        }

        /*
           The QR codes on the worksheet are URLs like:
           https://host/index.html?window=WINDOW-ID

           But we also accept a raw window ID or window number.
        */
        let windowKey = code;

        try {
            const url = new URL(code, window.location.href);

            /*
               The window QR codes carry ?w=AGA-WIN-0001.
            */
            const fromWindowId = url.searchParams.get("w");
            const fromQuery = url.searchParams.get("window");

            if (fromWindowId) {
                windowKey = fromWindowId;
            } else if (fromQuery) {
                windowKey = fromQuery;
            }
        } catch (parseError) {
            /*
               Not a URL - use the raw scanned value.
            */
        }

        /*
           A window now lives inside a project, so look through the
           flattened list. Match the printed window number first, then
           fall back to the internal id.
        */
        const all = getAllWindowsWithProject();

        const item =
            all.find(w => safeText(w.windowNumber) === windowKey) ||
            all.find(w => w.id === windowKey) ||
            getWindows().find(w => w.id === windowKey);

        if (!item) {

            showError(
                "This QR code does not belong to a registered AGA window."
            );

            return;
        }

        window.scannedWindow = item;

        /*
           Carry the chosen employee through to the production
           record, so the status buttons in the modal credit the
           right person without asking again.
        */
        const employeeId = safeText($("scanEmployeeSelect")?.value);

        const employeeName = getEmployeeName(employeeId);

        window.scannedEmployeeId = employeeId;
        window.scannedEmployeeName = employeeName;

        /*
           Record which window was actually scanned. updateWindowStatus
           checks this before allowing a status change, so scanning
           window A cannot be used to advance window B.
        */
        window.scannedWindowId = item.id;

        showSuccess(
            `${item.windowNumber || item.description || "Window"} found for ${employeeName}.`
        );

        /*
           Stop scanner after successful scan.
        */
        stopScanner();

        /*
           Open the window's production record straight away, so
           the next tap is the step that was just completed.
        */
        switchView("projects");

        if (item.projectId) {
            highlightProjectWindow(item.projectId, item.id);
        }

        viewWindow(item.id);

    } catch (error) {

        console.error(
            "QR scan handling error:",
            error
        );

        showError(
            "The scanned QR code could not be processed."
        );
    }
}

/* =========================================================
   PRINT WINDOW WORKSHEET
   ========================================================= */

function setPrintText(id, value, fallback = "-") {
    const element = $(id);
    if (element) {
        element.textContent = safeText(value) || fallback;
    }
}

/*
   Short forms used on the PRINTED schedule only.

   A printed schedule has eleven columns across an A4 page, so the
   longest status and colour names overflowed their cells. The app
   keeps the full wording; the paper gets a form that fits.

   These are readable at a glance on the bench, which matters more
   than being exhaustive on paper.
*/
const PRINT_STATUS_SHORT = {
    "Measured": "Measured",
    "In Production": "In Prod.",
    "Frame Manufactured": "Frame Mfd.",
    "Glazed": "Glazed",
    "Quality Checked": "QC Done",
    "Ready for Installation": "Ready",
    "Installed": "Installed",
    "Completed": "Completed"
};

const PRINT_FRAME_SHORT = {
    "Natural Aluminium": "Nat. Alu.",
    "Clear Anodised": "C. Anod.",
    "Dark Bronze": "Dk Bronze"
};

function formatPrintStatus(status) {

    const value = safeText(status) || "Measured";

    return PRINT_STATUS_SHORT[value] || value;
}

function formatPrintFrame(colour) {

    const value = safeText(colour);

    return PRINT_FRAME_SHORT[value] || value;
}

/*
   QC result as a short, unambiguous mark.

   An unchecked item reads "Todo", not a dash. A dash in a column
   headed QC is ambiguous - it could mean "not applicable", "no
   result" or "forgot to check". "Todo" says plainly that the
   inspection has not happened yet, which is what the workshop
   needs to know at a glance.
*/
function formatPrintQc(qcCheck) {

    const value = safeText(qcCheck).toLowerCase();

    if (value === "pass") {
        return "PASS";
    }

    if (value === "fail") {
        return "FAIL";
    }

    return "Todo";
}

/*
   A window's photo as a small thumbnail for the printed schedule.

   The stored value is a data URL written straight into src. It is
   passed through escapeHtml so a crafted value cannot break out of
   the attribute, and a window without a photo prints "\u2014".

   A missing photo is NOT an empty box: on a printed sheet a blank
   cell is ambiguous, so it says so in words.
*/
function printRowPhotoHtml(photo) {

    const value = safeText(photo);

    if (!value) {
        return `<span class="print-row-photo-none">\u2014</span>`;
    }

    return `<img class="print-row-photo" src="${escapeHtml(value)}" alt="Window photo">`;
}

/*
   A small "printed on" line in the footer. Useful on the floor:
   two worksheets for the same item are told apart by when they
   were produced, which matters when a job is reworked.
*/
function setPrintGenerated(id) {

    const element = $(id);

    if (!element) {
        return;
    }

    const now = new Date();

    const date = now.toLocaleDateString("en-ZA", {
        day: "numeric", month: "short", year: "numeric"
    });

    const time = now.toLocaleTimeString("en-ZA", {
        hour: "2-digit", minute: "2-digit"
    });

    element.textContent = `Printed ${date} at ${time}`;
}

/*
   Print a small LABEL for one window: number, QR and barcode.

   Distinct from printWindow(), which produces a full A4 worksheet of
   job detail. This one is for the frame itself - a sticker that says
   which item it is, so it can be scanned on the floor.

   Printing is isolated by toggling .print-label-active on <body>: the
   printed label only appears while that class is set, so an ordinary
   Ctrl+P of a worksheet never emits a stray sticker, and the worksheet
   is suppressed for the short time the label is being printed.
*/
function printLabel(windowId) {

    try {

        const item = findWindowForPrint(windowId);

        if (!item) {
            showError("The window could not be found.");
            return false;
        }

        const windowNumber = safeText(item.windowNumber);

        if (!windowNumber) {
            showError("This window does not have an ID yet, so there is nothing to label.");
            return false;
        }

        renderLabelSheet([item]);

        return printWithLabelMode();

    } catch (error) {

        document.body.classList.remove("print-label-active");

        console.error("Print label error:", error);

        showError("The label could not be printed.");

        return false;
    }
}

/*
   Print a label for EVERY window on a project, in one print job.

   The common case when a job arrives: thirty items each need a
   sticker, and doing that one window at a time means thirty trips
   into a record and back out. This builds the whole sheet at once.

   Windows without a number are skipped rather than printing blank
   stickers - they have nothing to scan and nothing to label.
*/
function printProjectLabels(projectId) {

    try {

        const project = getProjects().find(
            item => item.id === projectId
        );

        if (!project) {
            showError("The project could not be found.");
            return false;
        }

        const windows = Array.isArray(project.windows)
            ? project.windows
            : [];

        if (!windows.length) {
            showError("This project has no windows to label yet.");
            return false;
        }

        /*
           Carry the project detail onto each window, the same way
           getAllWindowsWithProject() does, so every label on the sheet
           shows which job it belongs to. Without this the stickers
           would be numbered but unlabelled as to project.
        */
        const labelled = windows
            .filter(window => safeText(window.windowNumber))
            .map(window => ({
                projectNumber: project.projectNumber,
                projectName: project.projectName,
                ...window
            }));

        if (!labelled.length) {
            showError("None of this project's windows have an ID yet, so there is nothing to label.");
            return false;
        }

        const skipped = windows.length - labelled.length;

        renderLabelSheet(labelled);

        if (skipped > 0) {
            showSuccess(
                `Printing ${labelled.length} label${labelled.length === 1 ? "" : "s"}. ` +
                `${skipped} window${skipped === 1 ? " has" : "s have"} no ID and ${skipped === 1 ? "was" : "were"} skipped.`
            );
        }

        return printWithLabelMode();

    } catch (error) {

        document.body.classList.remove("print-label-active");

        console.error("Print project labels error:", error);

        showError("The labels could not be printed.");

        return false;
    }
}

/* =========================================================
   LABEL PRINTER SETTINGS
   =========================================================
   Which sticker stock is loaded. The label was built around one
   size (90 x 55mm); this makes that a choice, because a workshop
   buys whatever sheet is available and a label that does not fit
   the sticker is useless.

   Sizes are in millimetres because that is how label stock is
   sold. `across` is how many labels sit side by side on the
   sheet, which decides the print grid.

   The QR and barcode are scaled with the label rather than being
   fixed, but both keep their minimum scannable size: a preset
   that would shrink the QR below ~15mm is not offered, because a
   phone camera cannot reliably resolve one that small.
========================================================= */

const LABEL_SIZE_PRESETS = {
    "90x55": {
        label: "90 \u00d7 55 mm (2 across A4)",
        width: 90,
        height: 55,
        across: 2,
        gap: 4,
        padding: 3,
        qr: 35,
        barcode: 80,
    },
    "70x40": {
        label: "70 \u00d7 40 mm (2 across A4)",
        width: 70,
        height: 40,
        across: 2,
        gap: 3,
        padding: 2.5,
        qr: 26,
        barcode: 62,
    },
    "64x34": {
        label: "64 \u00d7 34 mm (3 across A4) \u2014 common laser sheet",
        width: 64,
        height: 34,
        across: 3,
        gap: 2,
        padding: 2,
        qr: 21,
        barcode: 56,
    },
    "50x30": {
        label: "50 \u00d7 30 mm (3 across A4)",
        width: 50,
        height: 30,
        across: 3,
        gap: 2,
        padding: 1.5,
        qr: 17,
        barcode: 44,
    },
    "a4-sheet": {
        label: "A4 sheet, 1 label per page",
        width: 186,
        height: 130,
        across: 1,
        gap: 0,
        padding: 6,
        qr: 60,
        barcode: 160,
    },
};

const LABEL_PRESET_KEY = "aga_label_preset";

const DEFAULT_LABEL_PRESET = "90x55";

/*
   The QR must never be shrunk below this or it stops scanning.
   15mm is roughly the floor for a phone camera at arm's length.
*/
const MIN_LABEL_QR_MM = 15;

/*
   Read the saved preset name, falling back to the default when
   nothing is stored or the stored value names a preset that no
   longer exists (a stale key from an older build).
*/
function getLabelPresetName() {

    try {

        const stored = localStorage.getItem(LABEL_PRESET_KEY);

        if (stored && Object.prototype.hasOwnProperty.call(LABEL_SIZE_PRESETS, stored)) {
            return stored;
        }

    } catch (error) {

        /* Private mode can throw on localStorage; the default is fine. */
        console.warn("Could not read the label preset:", error);
    }

    return DEFAULT_LABEL_PRESET;
}

function getLabelPreset(name) {

    const key = name || getLabelPresetName();

    return LABEL_SIZE_PRESETS[key] || LABEL_SIZE_PRESETS[DEFAULT_LABEL_PRESET];
}

function setLabelPreset(name) {

    if (!Object.prototype.hasOwnProperty.call(LABEL_SIZE_PRESETS, name)) {
        return false;
    }

    try {
        localStorage.setItem(LABEL_PRESET_KEY, name);
    } catch (error) {
        console.warn("Could not save the label preset:", error);
        return false;
    }

    applyLabelPreset(name);

    return true;
}

/*
   Push the preset's geometry onto the label sheet as custom
   properties, which is what the print stylesheet reads.

   Setting them on the element (rather than rewriting a stylesheet)
   keeps this to one property write per value and leaves the CSS as
   the single place the geometry is.
*/
function applyLabelPreset(name) {

    const preset = getLabelPreset(name);

    const sheet = $("printLabel");

    if (!sheet) {
        return false;
    }

    const safeQr = Math.max(preset.qr, MIN_LABEL_QR_MM);

    sheet.style.setProperty("--label-width", preset.width + "mm");
    sheet.style.setProperty("--label-height", preset.height + "mm");
    sheet.style.setProperty("--label-gap", preset.gap + "mm");
    sheet.style.setProperty("--label-padding", preset.padding + "mm");
    sheet.style.setProperty("--label-qr-size", safeQr + "mm");
    sheet.style.setProperty("--label-barcode-width", preset.barcode + "mm");
    sheet.style.setProperty("--label-across", String(preset.across));

    return true;
}

/*
   The Printer Settings panel, shown from the label area.
*/
function buildLabelSettingsHtml() {

    const current = getLabelPresetName();

    const options = Object.keys(LABEL_SIZE_PRESETS).map(key => {

        const selected = key === current ? " selected" : "";

        return `<option value="${escapeHtml(key)}"${selected}>${escapeHtml(LABEL_SIZE_PRESETS[key].label)}</option>`;
    }).join("");

    const preset = getLabelPreset(current);

    return `<div class="label-settings">
        <h4 class="label-settings-title">Label printer settings</h4>

        <label class="label-settings-field" for="labelPresetSelect">
            <span>Sticker size</span>
            <select id="labelPresetSelect" onchange="setLabelPreset(this.value)">${options}</select>
        </label>

        <p class="label-settings-hint">
            Currently printing <strong>${escapeHtml(String(preset.width))} \u00d7 ${escapeHtml(String(preset.height))} mm</strong>
            labels, ${escapeHtml(String(preset.across))} across the sheet,
            with a ${escapeHtml(String(Math.max(preset.qr, MIN_LABEL_QR_MM)))} mm QR code.
        </p>

        <p class="label-settings-tip">
            In the print dialog set <strong>Margins: None</strong> and
            <strong>Scale: 100%</strong> (not "Fit to page"), or the labels will
            not land on the sticker positions.
        </p>
    </div>`;
}

/*
   Open the settings in the modal, so a label does not have to be
   printed to change the sticker size.
*/
function openLabelSettings() {

    const title = $("modalWindowTitle");
    const content = $("modalWindowContent");

    if (title) {
        title.textContent = "Label Printer Settings";
    }

    if (content) {
        content.innerHTML = buildLabelSettingsHtml();
    }

    const modal = $("windowModal");

    if (modal) {
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }
}

/*
   Fill the label sheet with one sticker per item.

   The markup is built here and both QR and barcode are drawn AFTER it
   is in the DOM, because both libraries paint into a real element that
   has to exist first.
*/
function renderLabelSheet(items) {

    const stack = $("printLabelStack");

    if (!stack) {
        throw new Error("The label sheet is missing from the page.");
    }

    /*
       Apply the saved sticker geometry before the markup is built,
       so the QR and barcode are drawn for the size they will print
       at rather than being rescaled afterwards.
    */
    applyLabelPreset(getLabelPresetName());

    stack.innerHTML = items.map((item, index) => {

        const windowNumber = safeText(item.windowNumber);

        const length = safeText(item.length) || safeText(item.finalWidth);
        const width = safeText(item.width) || safeText(item.finalHeight);

        const size = length && width
            ? `${length} \u00d7 ${width} mm`
            : "";

        const project = [item.projectNumber, item.projectName]
            .map(value => safeText(value))
            .filter(Boolean)
            .join("  \u00b7  ");

        return `<div class="print-label">
            <div class="print-label-head">
                <strong class="print-label-company">AGA Architectural Glass &amp; Aluminium</strong>
                <span class="print-label-project">${escapeHtml(project)}</span>
            </div>

            <div class="print-label-number">${escapeHtml(windowNumber)}</div>

            <div class="print-label-marks">
                <div class="print-label-qr" data-label-qr="${index}"
                    data-label-qr-value="${escapeHtml(windowNumber)}"></div>
                <div class="print-label-barcode" data-label-barcode="${index}"
                    data-label-barcode-value="${escapeHtml(windowNumber)}"></div>
            </div>

            <div class="print-label-meta">
                <span>${escapeHtml(safeText(item.productType) || safeText(item.windowType))}</span>
                <span>${escapeHtml(size)}</span>
            </div>
        </div>`;
    }).join("");

    stack.querySelectorAll("[data-label-qr-value]").forEach(node => {
        generateQRCodeInElement(
            node,
            buildWindowIdQRContent(node.dataset.labelQrValue),
            220
        );
    });

    stack.querySelectorAll("[data-label-barcode-value]").forEach(node => {
        generateBarcodeInElement(
            node,
            buildWindowBarcodeValue(node.dataset.labelBarcodeValue),
            60
        );
    });

    return items.length;
}

/*
   Set the label mode, print, and always clear it again.

   the class is removed on window.onafterprint AND in a finally-style
   fallback, because a browser that never fires afterprint (or a user
   who cancels the dialog) would otherwise leave <body> stuck in label
   mode, so the next worksheet print would come out as a sticker.
*/
function printWithLabelMode() {

    document.body.classList.add("print-label-active");

    const clear = () => {
        document.body.classList.remove("print-label-active");
        window.removeEventListener("afterprint", clear);
    };

    window.addEventListener("afterprint", clear);

    try {
        window.print();
    } finally {
        /*
           Do not clear synchronously: some browsers print AFTER
           window.print() returns, and removing the class here would
           blank the label. afterprint is the reliable signal; this is
           only a backstop for browsers that never fire it.
        */
        setTimeout(clear, 2000);
    }

    return true;
}

/*
   Find a window for printing, wherever it lives.

   Project windows are nested inside projects, not in the legacy flat
   STORAGE_KEY list, so getWindows() alone finds nothing for a window
   created through a project - which is every window the app now makes.
   getAllWindowsWithProject() is the authoritative lookup (the same one
   viewWindow uses), with the legacy list kept as a fallback.
*/
function findWindowForPrint(windowId) {

    if (!windowId) {
        return undefined;
    }

    return getAllWindowsWithProject().find(
        windowItem => windowItem.id === windowId
    ) || getWindows().find(
        windowItem => windowItem.id === windowId
    );
}

function printWindow(windowId) {

    try {

        /*
           Shared lookup: project windows are nested inside projects,
           so getWindows() alone used to find nothing here and every
           "Print Worksheet" answered "The window could not be found."
        */
        const item = findWindowForPrint(windowId);

        if (!item) {

            showError(
                "The window could not be found."
            );

            return;
        }

        /*
           This is the SINGLE ITEM worksheet, so every row in the
           detail grid describes this one window or door - including
           the item-level rows, which printProject() hides.
        */
        const sheet = $("printWorksheet");

        if (sheet) {
            sheet.classList.remove("print-project");
        }

        const length = safeText(item.length) || safeText(item.finalWidth);
        const width = safeText(item.width) || safeText(item.finalHeight);

        setPrintText("printWindowId", item.windowNumber);
        setPrintText("printProjectName", item.projectName);
        setPrintText("printProjectNameSub", item.customerName);
        setPrintText("printCustomerName", item.customerName);

        setPrintText("printSiteAddress", item.siteAddress);

        const contact = [item.customerEmail, item.customerPhone]
            .map(value => safeText(value))
            .filter(Boolean)
            .join("  \u00b7  ");

        setPrintText("printCustomerContact", contact);

        setPrintText(
            "printWindowType",
            item.productType || item.windowType
        );

        setPrintText(
            "printLocation",
            item.location || item.windowLocation
        );

        setPrintText(
            "printFrameColour",
            item.frameColour +
            (item.customFrameColour ? ` (${item.customFrameColour})` : "")
        );

        /*
           Sizes are the headline numbers on the floor, so they are
           never left as a bare dash when a value exists on the
           record.

           The "mm" unit lives in the row label ("Size (mm)") rather
           than beside each number, so this reads "2400 × 2100" and
           not "2400 mm × 2100 mm".
        */
        setPrintText("printWidth", length || "\u2014");
        setPrintText("printHeight", width || "\u2014");

        setPrintText(
            "printGlassType",
            [item.glassType, item.glassThickness]
                .map(value => safeText(value))
                .filter(Boolean)
                .join("  \u00b7  ")
        );

        setPrintText(
            "printAllocatedTo",
            item.allocatedTo || "Unallocated"
        );

        setPrintText(
            "printQcCheck",
            item.qcCheck || "Pending"
        );

        const notesBox = $("printNotes");

        if (notesBox) {
            notesBox.textContent = safeText(item.notes);
        }

        /*
           Title-block status chip, so the item's stage is obvious
           at arm's length on the bench.
        */
        const chip = $("printStatusChip");

        if (chip) {
            chip.textContent = item.status || "Measured";
        }

        setPrintText(
            "printDate",
            new Date().toLocaleDateString("en-ZA", {
                day: "numeric", month: "short", year: "numeric"
            })
        );

        const manufacturerCell = $("printManufacturer");
        const employeeCell = $("printEmployee");

        if (manufacturerCell) {
            manufacturerCell.textContent = safeText(item.manufacturedBy);
        }

        if (employeeCell) {
            employeeCell.textContent =
                safeText(item.checkedBy) || safeText(item.manufacturedBy);
        }

        /*
           A single item has one size, so the pair form is correct
           here and the separator must be visible. (printProject
           hides it, because a project shows a range instead.)
        */
        const dimSeparator = document.querySelector(".print-dim-sep");

        if (dimSeparator) {
            dimSeparator.hidden = false;
        }

        /* A single item is a pair, not two ranges. */
        const dimCell = document.querySelector(".print-dim-cell");

        if (dimCell) {
            dimCell.classList.remove("print-dim-ranging");
        }

        /*
           The single-item sheet has exactly one photo, so it is
           worth printing. An empty block is hidden instead of
           printing a broken frame.
        */
        const photo = $("printPhoto");
        const photoSection = $("printPhotoSection");

        const hasPhoto = Boolean(safeText(item.photo));

        if (photoSection) {
            photoSection.hidden = !hasPhoto;
        }

        if (photo && hasPhoto) {
            photo.src = item.photo;
        }

        /*
           This sheet prints its one photo in the block above, so
           the schedule's photo column is hidden here. Without this
           the header would sit over an empty column on every
           single-item sheet.
        */
        const photoHeader = document.querySelector("#printWorksheet th.c-photo");

        if (photoHeader) {
            photoHeader.hidden = true;
        }

        /*
           One item on the sheet, so the schedule shows just it, and
           the notes block gets a real box to write in.
        */
        const schedule = $("printSchedule");

        /*
           Two rows per item, matching the two heading rows: the
           identity and measurements on top, the specification and
           the QR code below. The QR cell spans both rows.

           This is what buys the columns their width. Thirteen values
           on one line forces every column narrow; split across two
           lines each value gets roughly double the room, which is
           why the schedule can be set larger and still fit A4.
        */
        if (schedule) {
            schedule.innerHTML = `
                <tr class="print-row-1">
                    <td class="c-id">${escapeHtml(item.windowNumber || "\u2014")}</td>
                    <td class="c-desc">${escapeHtml(item.description || "\u2014")}</td>
                    <td class="c-loc">${escapeHtml(item.location || item.windowLocation || "\u2014")}</td>
                    <td class="c-size">${escapeHtml(length || "\u2014")}</td>
                    <td class="c-size">${escapeHtml(width || "\u2014")}</td>
                    <td class="c-frame">${escapeHtml(formatPrintFrame(item.frameColour) || "\u2014")}</td>
                    <td class="c-barcode" rowspan="2"><span class="print-row-barcode" data-barcode-print="${escapeHtml(item.windowNumber || "")}"></span></td>
                    <td class="c-qr" rowspan="2"><span class="print-row-qr" data-qr-print="${escapeHtml(item.windowNumber || "")}"></span></td>
                </tr>
                <tr class="print-row-2">
                    <td class="c-type">${escapeHtml(item.productType || item.windowType || "\u2014")}</td>
                    <td class="c-glass">${escapeHtml(item.glassType || "\u2014")}</td>
                    <td class="c-who">${escapeHtml(item.allocatedTo || "Unallocated")}</td>
                    <td class="c-status">${escapeHtml(formatPrintStatus(item.status))}</td>
                    <td class="c-qc">${escapeHtml(formatPrintQc(item.qcCheck))}</td>
                    <td class="c-photo" hidden></td>
                </tr>
            `;

            renderPrintQRCodes(schedule);
            renderPrintBarcodes(schedule);
        }

        setPrintText("printScheduleCount", "1 item");

        setPrintGenerated("printGenerated");

        /*
           QR code pointing back at this window record.
        */
        generateQRCode("printQRCode", buildQRContent(item.id));

        /*
           Allow the page a moment to draw the QR before printing.
        */
        setTimeout(() => {
            window.print();
        }, 250);

    } catch (error) {

        console.error(
            "Print error:",
            error
        );

        showError(
            "The workshop worksheet could not be printed."
        );
    }
}

/* =========================================================
   CUSTOM FRAME COLOUR
   ========================================================= */

function handleFrameColourChange() {

    const select =
        $("frameColour");

    const group =
        $("customColourGroup");

    if (!select || !group) {
        return;
    }

    if (
        select.value.toLowerCase() ===
        "custom"
    ) {

        group.hidden = false;

    } else {

        group.hidden = true;
    }
}

/* =========================================================
   PRODUCTIVITY DASHBOARD
   =========================================================

   Reads the activity log and reports, for a chosen period:
     - total steps completed
     - windows worked on
     - employees active
     - average steps per working day
     - a per-employee ranking
     - a breakdown by production status
     - the raw recent activity list
*/

/*
   The currently selected period. "preset" is one of today / 7 /
   30 / month / all; "custom" carries explicit from/to dates.
*/
let productivityPeriod = {
    preset: "today",
    from: null,
    to: null
};

/*
   Start of the day, so "today" means the whole calendar day
   rather than the last 24 hours.
*/
function startOfDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

function endOfDay(date) {
    const copy = new Date(date);
    copy.setHours(23, 59, 59, 999);
    return copy;
}

/*
   Turn the current selection into a concrete { from, to } window.
   Returns null boundaries when "All time" is selected.
*/
function getPeriodRange() {

    const now = new Date();

    switch (productivityPeriod.preset) {

        case "today":
            return { from: startOfDay(now), to: endOfDay(now) };

        case "7": {
            const from = startOfDay(now);
            from.setDate(from.getDate() - 6);
            return { from, to: endOfDay(now) };
        }

        case "30": {
            const from = startOfDay(now);
            from.setDate(from.getDate() - 29);
            return { from, to: endOfDay(now) };
        }

        case "month": {
            const from = new Date(now.getFullYear(), now.getMonth(), 1);
            return { from: startOfDay(from), to: endOfDay(now) };
        }

        case "custom": {
            const from = productivityPeriod.from
                ? startOfDay(new Date(productivityPeriod.from))
                : null;

            const to = productivityPeriod.to
                ? endOfDay(new Date(productivityPeriod.to))
                : null;

            return { from, to };
        }

        default:
            return { from: null, to: null };
    }
}

function periodLabel() {

    const { from, to } = getPeriodRange();

    const short = (date) => date.toLocaleDateString("en-ZA", {
        day: "numeric", month: "short", year: "numeric"
    });

    if (!from && !to) {
        return "Showing all time.";
    }

    if (from && to) {
        return `Showing ${short(from)} to ${short(to)}.`;
    }

    if (from) {
        return `Showing from ${short(from)} onwards.`;
    }

    return `Showing up to ${short(to)}.`;
}

/*
   The activity entries that fall inside the selected period.
*/
function getActivityInPeriod() {

    const { from, to } = getPeriodRange();

    return getActivity().filter(entry => {

        const when = new Date(entry.date);

        if (isNaN(when.getTime())) {
            return false;
        }

        if (from && when < from) {
            return false;
        }

        if (to && when > to) {
            return false;
        }

        return true;
    });
}

/*
   Working days covered by the period, used for the daily average.
   Counts the span of days that actually have activity, so a
   one-off job on a Monday averages against one day, not a month.
*/
function activeDayCount(entries) {

    if (!entries.length) {
        return 0;
    }

    const days = new Set(
        entries.map(entry => {
            const d = new Date(entry.date);
            return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        })
    );

    return days.size;
}

function formatDateTime(value) {

    const date = new Date(value);

    if (isNaN(date.getTime())) {
        return "-";
    }

    const day = date.toLocaleDateString("en-ZA", {
        day: "numeric", month: "short"
    });

    const time = date.toLocaleTimeString("en-ZA", {
        hour: "2-digit", minute: "2-digit"
    });

    return `${day} ${time}`;
}

function renderProductivity() {

    try {

        if (!$("productivity-view")) {
            return;
        }

        const entries = getActivityInPeriod();

        const totalSteps = entries.length;

        const windowsTouched = new Set(
            entries.map(entry => entry.windowId || entry.windowNumber)
        ).size;

        const employeeTally = {};

        entries.forEach(entry => {

            const name = safeText(entry.employee) || "Unrecorded";

            if (!employeeTally[name]) {
                employeeTally[name] = {
                    name,
                    steps: 0,
                    windows: new Set(),
                    last: null,
                    byStatus: {}
                };
            }

            const row = employeeTally[name];

            row.steps += 1;

            row.windows.add(entry.windowId || entry.windowNumber);

            const when = new Date(entry.date);

            if (!isNaN(when.getTime()) && (!row.last || when > row.last)) {
                row.last = when;
            }

            const status = safeText(entry.status) || "Unknown";
            row.byStatus[status] = (row.byStatus[status] || 0) + 1;
        });

        const employees = Object.values(employeeTally)
            .sort((a, b) => b.steps - a.steps);

        const days = activeDayCount(entries);

        setTextIfExists("prodTotalSteps", totalSteps);
        setTextIfExists("prodWindowsTouched", windowsTouched);
        setTextIfExists("prodActiveEmployees", employees.length);
        setTextIfExists(
            "prodAvgPerDay",
            days ? Math.round((totalSteps / days) * 10) / 10 : 0
        );

        setTextIfExists("periodSummary", periodLabel());

        renderProductivityTable(employees, totalSteps);
        renderProductivitySteps(entries, totalSteps);
        renderProductivityLog(entries);

    } catch (error) {

        console.error("Productivity render error:", error);

        showError("The productivity dashboard could not be displayed.");
    }
}

/*
   Per-employee ranking. A share bar makes the difference between
   people obvious at a glance rather than by comparing numbers.
*/
function renderProductivityTable(employees, totalSteps) {

    const container = $("productivityTable");

    if (!container) {
        return;
    }

    if (!employees.length) {

        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-state-icon" aria-hidden="true">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 16v-5M11.5 16V7M16 16v-3"/></svg>
                </span>
                <h4>No activity in this period</h4>
                <p>Scan a window QR code, choose the employee doing the work, and their completed steps will appear here.</p>
            </div>
        `;

        return;
    }

    const rows = employees.map((employee, index) => {

        const share = totalSteps
            ? Math.round((employee.steps / totalSteps) * 100)
            : 0;

        const last = employee.last
            ? formatDateTime(employee.last)
            : "-";

        return `
            <tr>
                <td class="col-rank">${index + 1}</td>
                <td class="col-name">
                    <strong>${escapeHtml(employee.name)}</strong>
                    <small>${employee.windows.size} window${employee.windows.size === 1 ? "" : "s"} worked</small>
                </td>
                <td class="col-steps">
                    <strong>${employee.steps}</strong>
                    <small>step${employee.steps === 1 ? "" : "s"}</small>
                </td>
                <td class="col-share">
                    <div class="share-bar" title="${share}% of all steps in this period">
                        <span style="width:${share}%"></span>
                    </div>
                    <small>${share}%</small>
                </td>
                <td class="col-last">${escapeHtml(last)}</td>
            </tr>
        `;
    }).join("");

    container.innerHTML = `
        <div class="window-rows-wrapper">
            <table class="window-rows-table productivity-table">
                <thead>
                    <tr>
                        <th class="col-rank">#</th>
                        <th class="col-name">Employee</th>
                        <th class="col-steps">Steps</th>
                        <th class="col-share">Share</th>
                        <th class="col-last">Last Active</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

/*
   Which production steps were actually performed.
*/
function renderProductivitySteps(entries, totalSteps) {

    const container = $("productivitySteps");

    if (!container) {
        return;
    }

    if (!entries.length) {

        container.innerHTML = `<p class="details-small">No completed steps in this period.</p>`;

        return;
    }

    const tally = {};

    entries.forEach(entry => {
        const status = safeText(entry.status) || "Unknown";
        tally[status] = (tally[status] || 0) + 1;
    });

    const steps = Object.entries(tally)
        .sort((a, b) => b[1] - a[1]);

    container.innerHTML = `
        <div class="step-grid">
            ${steps.map(([status, count]) => {

        const share = totalSteps
            ? Math.round((count / totalSteps) * 100)
            : 0;

        return `
                    <div class="step-card">
                        <span class="status-badge ${statusBadgeClass(status)}">${escapeHtml(status)}</span>
                        <strong>${count}</strong>
                        <small>${share}% of steps</small>
                    </div>
                `;
    }).join("")}
        </div>
    `;
}

/*
   Raw log of the most recent steps, newest first.
*/
function renderProductivityLog(entries) {

    const container = $("productivityLog");

    if (!container) {
        return;
    }

    if (!entries.length) {

        container.innerHTML = `<p class="details-small">Nothing recorded in this period.</p>`;

        return;
    }

    const recent = [...entries]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 40);

    container.innerHTML = `
        <ul class="activity-log">
            ${recent.map(entry => `
                <li>
                    <span class="status-badge ${statusBadgeClass(entry.status)}">${escapeHtml(entry.status)}</span>
                    <span class="activity-main">
                        <strong>${escapeHtml(entry.employee)}</strong>
                        <small>${escapeHtml(entry.windowNumber || "-")} &middot; ${escapeHtml(entry.description || "")}</small>
                    </span>
                    <span class="activity-when">${escapeHtml(formatDateTime(entry.date))}</span>
                </li>
            `).join("")}
        </ul>
    `;
}

/*
   Fill the employee dropdown on the scanner with the workshop
   team, alphabetical so it is quick to find a name.
*/
/*
   Fill the "allocated to" filter with the team, so the Windows
   tab can be narrowed to one person's work.
*/
function renderAllocatedFilterOptions() {

    const select = $("allocatedFilter");

    if (!select) {
        return;
    }

    const current = select.value || "all";

    const employees = [...getEmployees()].sort(
        (a, b) => safeText(a.name).localeCompare(safeText(b.name))
    );

    select.innerHTML =
        `<option value="all">All Allocations</option>` +
        `<option value="unallocated">Unallocated</option>` +
        employees.map(employee =>
            `<option value="${escapeHtml(employee.name)}">${escapeHtml(employee.name)}</option>`
        ).join("");

    /*
       Restore the previous choice when that employee still exists.
    */
    const stillValid = [...select.options].some(
        option => option.value === current
    );

    select.value = stillValid ? current : "all";
}

function renderScanEmployeeOptions() {

    const select = $("scanEmployeeSelect");

    if (!select) {
        return;
    }

    const current = select.value;

    const employees = [...getEmployees()].sort(
        (a, b) => safeText(a.name).localeCompare(safeText(b.name))
    );

    select.innerHTML = `<option value="">Select your name...</option>` +
        employees.map(employee =>
            `<option value="${escapeHtml(employee.id)}">${escapeHtml(employee.name)}${employee.number ? ` (${escapeHtml(employee.number)})` : ""}</option>`
        ).join("");

    /*
       Keep the selection if that employee still exists, so a
       re-render does not lose the person's choice mid-shift.
    */
    if (current && employees.some(employee => employee.id === current)) {
        select.value = current;
    }

    updateScanGateState();
}

/*
   The employee must be chosen before scanning is allowed. The
   Start Camera button stays disabled until then, and says why.
*/
function updateScanGateState() {

    const select = $("scanEmployeeSelect");
    const startButton = $("startScannerButton");
    const hint = $("scanEmployeeHint");

    if (!select || !startButton) {
        return;
    }

    const chosen = safeText(select.value);

    const noEmployees = getEmployees().length === 0;

    if (noEmployees) {

        startButton.disabled = true;

        if (hint) {
            hint.textContent = "No employees yet. Add your team on the Team tab first.";
            hint.className = "scan-employee-hint scan-employee-warn";
        }

        return;
    }

    if (!chosen) {

        startButton.disabled = true;

        if (hint) {
            hint.textContent = "Choose your name first. Every scan is recorded against it.";
            hint.className = "scan-employee-hint";
        }

        return;
    }

    startButton.disabled = false;

    if (hint) {
        hint.textContent = `Scanning as ${getEmployeeName(chosen)}.`;
        hint.className = "scan-employee-hint scan-employee-ok";
    }
}

/* =========================================================
   VIEW SWITCHING
   ========================================================= */

/*
   The single-window capture form was merged into the Projects flow:
   a project holds one or many windows, so "new" now opens the project
   form on the Projects view.
*/
const VIEW_NAMES = [
    "dashboard",
    "projects",
    "windows",
    "scanner",
    "employees",
    "productivity",
    "quotes"
];

/*
   Any request for the retired "new-window" view is redirected here.
*/
function openNewProject() {
    switchView("projects");
    resetProjectForm();
    openProjectForm();
}

function switchView(viewName) {

    if (!VIEW_NAMES.includes(viewName)) {
        viewName = "dashboard";
    }

    /*
       Activate the correct section.
    */
    VIEW_NAMES.forEach(name => {
        const section = $(`${name}-view`);
        if (section) {
            const isActive = name === viewName;

            if (isActive) {
                section.classList.add("active");
            } else {
                section.classList.remove("active");
            }
        }
    });

    /*
       Update the nav buttons.
    */
    document.querySelectorAll(".nav-button").forEach(button => {
        const isActive = button.dataset.view === viewName;

        if (isActive) {
            button.classList.add("active");
        } else {
            button.classList.remove("active");
        }
    });

    /*
       Stop the camera if we leave the scanner view.
    */
    if (viewName !== "scanner") {

        stopScanner();

        /*
           Leaving the scanner clears any search, so returning to
           it always starts clean rather than showing a stale list.
        */
        const searchInput = $("scanSearchInput");

        if (searchInput) {
            searchInput.value = "";
            renderScanSearch();
        }
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

window.switchView = switchView;

/* =========================================================
   EVENT LISTENERS
   ========================================================= */

function initialiseEventListeners() {

    try {

        const employeeForm =
            $("employeeForm");

        if (employeeForm) {
            employeeForm.addEventListener(
                "submit",
                addEmployee
            );
        }

        /*
           Project form and its window rows
        */
        const projectForm =
            $("projectForm");

        if (projectForm) {
            projectForm.addEventListener(
                "submit",
                createProject
            );
        }

        const addRowButton =
            $("addWindowRowButton");

        if (addRowButton) {
            addRowButton.addEventListener(
                "click",
                () => addProjectWindowRow()
            );
        }

        const cancelProjectButton =
            $("cancelProjectButton");

        if (cancelProjectButton) {
            cancelProjectButton.addEventListener(
                "click",
                resetProjectForm
            );
        }

        const projectsNewButton =
            $("projectsNewButton");

        if (projectsNewButton) {
            projectsNewButton.addEventListener(
                "click",
                () => {
                    /* Always start a clean create, not an edit. */
                    resetProjectForm();
                    updateProjectFormMode();
                    openProjectForm();
                }
            );
        }

        const projectSearch =
            $("projectSearch");

        if (projectSearch) {
            projectSearch.addEventListener(
                "input",
                filterProjects
            );
        }

        const photoInput =
            $("windowPhoto");

        if (photoInput) {

            photoInput.addEventListener(
                "change",
                handlePhotoPreview
            );
        }

        const frameColour =
            $("frameColour");

        if (frameColour) {

            frameColour.addEventListener(
                "change",
                handleFrameColourChange
            );
        }

        const search =
            $("windowSearch");

        if (search) {

            search.addEventListener(
                "input",
                filterWindows
            );
        }

        const statusFilter =
            $("statusFilter");

        if (statusFilter) {

            statusFilter.addEventListener(
                "change",
                filterWindows
            );
        }

        const ageFilter =
            $("ageFilter");

        if (ageFilter) {

            ageFilter.addEventListener(
                "change",
                filterWindows
            );
        }

        const qcFilter =
            $("qcFilter");

        if (qcFilter) {

            qcFilter.addEventListener(
                "change",
                filterWindows
            );
        }

        const allocatedFilter =
            $("allocatedFilter");

        if (allocatedFilter) {

            allocatedFilter.addEventListener(
                "change",
                filterWindows
            );
        }

        const startScannerButton =
            $("startScannerButton");

        if (startScannerButton) {

            startScannerButton.addEventListener(
                "click",
                startScanner
            );
        }

        const stopScannerButton =
            $("stopScannerButton");

        if (stopScannerButton) {

            stopScannerButton.addEventListener(
                "click",
                stopScanner
            );
        }

        const closeButton =
            $("closeWindowModal");

        if (closeButton) {

            closeButton.addEventListener(
                "click",
                closeWindowModal
            );
        }

        /*
           Navigation buttons
        */
        document.querySelectorAll(".nav-button").forEach(button => {
            button.addEventListener("click", () => {
                switchView(button.dataset.view);
            });
        });

        /*
           Scanner employee dropdown. Changing the name immediately
           updates the gate, so Start Camera enables as soon as a
           name is chosen.
        */
        const scanEmployeeSelect = $("scanEmployeeSelect");

        if (scanEmployeeSelect) {

            scanEmployeeSelect.addEventListener(
                "change",
                updateScanGateState
            );
        }

        /*
           Scanner search: find a window without the camera.
        */
        const scanSearchInput = $("scanSearchInput");

        if (scanSearchInput) {

            scanSearchInput.addEventListener(
                "input",
                renderScanSearch
            );

            /*
               Enter opens the only result, so a full window ID can
               be typed and confirmed without reaching for a mouse.
            */
            scanSearchInput.addEventListener("keydown", event => {

                if (event.key !== "Enter") {
                    return;
                }

                event.preventDefault();

                if (scanSearchMatches.length === 1) {
                    openWindowFromSearch(scanSearchMatches[0]);
                }
            });
        }

        const scanSearchClearButton = $("scanSearchClearButton");

        if (scanSearchClearButton) {

            scanSearchClearButton.addEventListener("click", () => {

                if (scanSearchInput) {
                    scanSearchInput.value = "";
                    scanSearchInput.focus();
                }

                renderScanSearch();
            });
        }

        /*
           Productivity period presets.
        */
        document.querySelectorAll(".period-button").forEach(button => {

            button.addEventListener("click", () => {

                productivityPeriod.preset = button.dataset.period;
                productivityPeriod.from = null;
                productivityPeriod.to = null;

                document.querySelectorAll(".period-button").forEach(other => {
                    other.classList.toggle(
                        "active",
                        other === button
                    );
                });

                /* Clear the custom date boxes so the preset wins. */
                if ($("periodFrom")) $("periodFrom").value = "";
                if ($("periodTo")) $("periodTo").value = "";

                renderProductivity();
            });
        });

        const applyPeriodButton = $("applyPeriodButton");

        if (applyPeriodButton) {

            applyPeriodButton.addEventListener("click", () => {

                const from = safeText($("periodFrom")?.value);
                const to = safeText($("periodTo")?.value);

                if (!from && !to) {
                    showError("Choose a from date, a to date, or both.");
                    return;
                }

                if (from && to && new Date(from) > new Date(to)) {
                    showError("The from date must be before the to date.");
                    return;
                }

                productivityPeriod.preset = "custom";
                productivityPeriod.from = from || null;
                productivityPeriod.to = to || null;

                document.querySelectorAll(".period-button").forEach(other => {
                    other.classList.remove("active");
                });

                renderProductivity();
            });
        }

        /*
           Dashboard / list "New Window" buttons
        */
        const dashboardNewButton =
            $("dashboardNewWindowButton");

        if (dashboardNewButton) {
            dashboardNewButton.addEventListener("click", () => {
                openNewProject();
            });
        }

        const windowsNewButton =
            $("windowsNewButton");

        if (windowsNewButton) {
            windowsNewButton.addEventListener("click", () => {
                openNewProject();
            });
        }

        /*
           Scan button on the dashboard: jumps straight to the
           camera, so the workshop does not have to hunt for it.
        */
        const dashboardScanButton =
            $("dashboardScanButton");

        if (dashboardScanButton) {

            dashboardScanButton.addEventListener("click", () => {
                switchView("scanner");
            });
        }

    } catch (error) {

        console.error(
            "Event listener setup error:",
            error
        );

        showError(
            "Some application controls could not be initialized."
        );
    }
}

/* =========================================================
   DEEP LINK HANDLING
   =========================================================

   A QR code on a worksheet is a URL like:
   https://host/index.html?window=WINDOW-ID

   When a phone's default camera app scans that QR code it
   opens the website with the window query parameter, and we
   jump straight to the production record.
*/

function handleDeepLink() {
    try {
        const params = new URLSearchParams(window.location.search);
        const windowId = params.get("window");
        const projectId = params.get("project");
        const windowNumber = params.get("w");

        /*
           A window QR code scanned by the phone camera lands here.
        */
        if (windowNumber) {
            const all = getAllWindowsWithProject();

            const match =
                all.find(w => safeText(w.windowNumber) === windowNumber) ||
                all.find(w => w.id === windowNumber);

            history.replaceState(
                null,
                "",
                window.location.origin + window.location.pathname
            );

            if (!match) {
                showError("This QR code does not match a saved window.");
                return;
            }

            switchView("projects");

            if (match.projectId) {
                highlightProjectWindow(match.projectId, match.id);
            }

            showSuccess(`${match.windowNumber} found.`);

            return;
        }

        if (projectId) {
            const project = getProjects().find(
                item => item.id === projectId
            );

            switchView("projects");

            if (project) {
                showSuccess(`${project.projectNumber} opened.`);
            } else {
                showError("This project could not be found.");
            }

            const cleanProjectUrl =
                window.location.origin +
                window.location.pathname;

            history.replaceState(null, "", cleanProjectUrl);

            return;
        }

        if (!windowId) {
            return;
        }

        const windows = getWindows();

        const item = windows.find(
            windowItem => windowItem.id === windowId
        );

        if (item) {
            viewWindow(windowId);
        }

        /*
           Remove the parameter so a refresh doesn't re-open it.
        */
        const cleanUrl =
            window.location.origin +
            window.location.pathname;

        history.replaceState(null, "", cleanUrl);

    } catch (error) {
        console.error("Deep link error:", error);
    }
}

/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.createWindow =
    createWindow;

window.addEmployee =
    addEmployee;

window.viewWindow =
    viewWindow;

window.updateWindowStatus =
    updateWindowStatus;

window.printWindow =
    printWindow;

window.startScanner =
    startScanner;

window.stopScanner =
    stopScanner;

window.handleScannedQRCode =
    handleScannedQRCode;

window.closeWindowModal =
    closeWindowModal;

window.generateQRCode =
    generateQRCode;

window.buildQRContent =
    buildQRContent;

window.getEmployees =
    getEmployees;

window.getEmployeeName =
    getEmployeeName;

window.getProjects =
    getProjects;

window.createProject =
    createProject;

window.addProjectWindowRow =
    addProjectWindowRow;

window.filterProjects =
    filterProjects;

window.openNewProject =
    openNewProject;

window.getAllWindowsWithProject =
    getAllWindowsWithProject;

window.renderProductivity =
    renderProductivity;

window.renderDashboardProjects =
    renderDashboardProjects;

window.renderAllocatedFilterOptions =
    renderAllocatedFilterOptions;

window.renderScanSearch =
    renderScanSearch;

window.openWindowFromSearch =
    openWindowFromSearch;

window.renderDashboardWindows =
    renderDashboardWindows;

window.getActivity =
    getActivity;

window.logActivity =
    logActivity;

/* =========================================================
   APPLICATION STARTUP
   ========================================================= */

/*
   Boot the working app.

   Kept separate from the listener below because it runs either
   straight away (offline-only mode) or after a successful PIN
   sign-in. The guard makes it safe to call from both paths.
*/
let appStarted = false;

async function startApp() {

    if (appStarted) {
        return;
    }

    appStarted = true;

    try {

        /*
           Pull the workshop's data. If the phone is offline this
           quietly returns what is already stored locally, so the
           app still opens and works.
        */
        const pull = await initBackend();

        if (pull && pull.ok) {

            /*
               Re-render from the server copy. Only safe because
               the pull refuses to overwrite when changes are still
               queued for upload.
            */
            renderAll();
        }

        initialiseEventListeners();

        /* Bring the quote builder up in the same guarded way. */
        if (typeof window.initQuotes === "function") {
            window.initQuotes();
        }


        /* Start the first project with a single empty window row. */
        addProjectWindowRow();

        renderAll();
        handleDeepLink();
        updateSyncIndicator();

        console.log(
            "AGA Workshop Management System loaded successfully."
        );

    } catch (error) {

        console.error("Application startup error:", error);

        showError(
            "The AGA application could not be started correctly."
        );
    }
}

window.startApp = startApp;

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            /* Register the PWA service worker so the app keeps working
               offline (cached app shell). Safe to call on every load -
               the browser ignores duplicate registrations. */
            if ("serviceWorker" in navigator) {
                navigator.serviceWorker
                    .register("./sw.js", { scope: "./" })
                    .catch((error) => {
                        console.error("AGA: service worker registration failed", error);
                    });
            }

            initialiseSignIn();

            /*
               No backend yet: the app runs exactly as before,
               entirely on this device. This keeps the workshop
               working during setup rather than showing a sign-in
               screen it cannot satisfy.
            */
            if (!isBackendConfigured()) {

                await startApp();

                return;
            }

            /*
               OPEN ACCESS: the app is deliberately open to anyone
               with the link while the workshop gets running. No
               PIN screen. Employees still choose their name when
               they scan, so work is still credited to a person.
            */
            if (isOpenAccess()) {

                hideSignIn();

                /*
                   Show Sign out only when a session exists, so the
                   header does not offer an action that does
                   nothing.
                */
                const signOutButton = document.getElementById("signOutButton");

                if (signOutButton) {
                    signOutButton.hidden = !getSession();
                }

                await startApp();

                return;
            }

            /*
               PIN mode: a signed-in phone goes straight in, so the
               PIN is entered once per device, not on every scan.
            */
            if (getSession()) {

                hideSignIn();

                await startApp();

                return;
            }

            showSignIn();

            await renderSignInEmployees();

        } catch (error) {

            console.error(
                "Application startup error:",
                error
            );

            showError(
                "The AGA application could not be started correctly."
            );
        }
    }
);
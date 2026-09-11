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

const STATUSES = [
    "Measured",
    "In Production",
    "Frame Manufactured",
    "Glazed",
    "Quality Checked",
    "Ready for Installation",
    "Installed",
    "Completed"
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

        return true;
    } catch (error) {
        console.error("Could not save projects:", error);

        showError(
            "The project could not be saved. Your browser storage may be full."
        );

        return false;
    }
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

        const windows = getWindows();

        const index = windows.findIndex(
            item => item.id === windowId
        );

        if (index === -1) {
            throw new Error(
                "The selected window could not be found."
            );
        }

        const item = windows[index];

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

        if (newStatus === item.status) {
            showError(
                `This window is already "${newStatus}".`
            );
            return false;
        }

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
           When the window is quality checked, record WHO checked it.
        */
        if (newStatus === "Quality Checked") {
            item.checkedById = employeeId;
            item.checkedBy = effectiveEmployeeName;
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

        if (!saveWindows(windows)) {
            return false;
        }

        /*
           Email notification (best effort).
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

        employees.push({
            id: uuid(),

            name,
            number,

            createdAt:
                new Date().toISOString()
        });

        if (!saveEmployees(employees)) {
            return;
        }

        showSuccess(
            `${name} has been added.`
        );

        const form =
            $("employeeForm");

        if (form) {
            form.reset();
        }

        renderEmployees();

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
        <td class="window-row-photo-cell">
            <div class="row-photo" data-field="photo">
                <input type="file" class="row-photo-input" accept="image/*" capture="environment"
                    hidden onchange="handleRowPhotoPick(this)">

                <button type="button" class="row-photo-add" title="Add photo"
                    onclick="this.previousElementSibling.click()">
                    <span aria-hidden="true">📷</span>
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

    tbody.appendChild(tr);
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
    return !row.description &&
        !row.location &&
        !row.length &&
        !row.width &&
        !row.frameColour &&
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

    addProjectWindowRow();

    if (form) {
        form.hidden = true;
    }
}

function openProjectForm() {

    const form = $("projectForm");

    if (!form) {
        return;
    }

    form.hidden = false;

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
        const position = `Window row ${index + 1}`;

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

        const windows = collectProjectWindowRows()
            .filter(row => !isBlankWindowRow(row))
            .map(row => ({
                id: uuid(),
                description: row.description,
                location: row.location,
                length: Number(row.length),
                width: Number(row.width),
                frameColour: row.frameColour,
                photo: row.photo || "",
                status: "Measured",
                createdAt: now
            }));

        const newProject = {
            id: uuid(),

            projectNumber: generateProjectNumber(),

            projectName: safeText($("prjName")?.value),
            customerName: safeText($("prjCustomerName")?.value),
            customerEmail: safeText($("prjCustomerEmail")?.value),
            customerPhone: safeText($("prjCustomerPhone")?.value),
            siteAddress: safeText($("prjSiteAddress")?.value),

            windows,

            createdAt: now,
            updatedAt: now
        };

        projects.push(newProject);

        if (!saveProjects(projects)) {
            return;
        }

        showSuccess(
            `${newProject.projectNumber} saved with ${windows.length} window${windows.length === 1 ? "" : "s"}.`
        );

        resetProjectForm();

        renderAll();

    } catch (error) {

        console.error(
            "Unexpected error creating project:",
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
                        .includes(search);

                const matchesStatus =
                    !status ||
                    status === "all" ||
                    item.status === status;

                return (
                    matchesSearch &&
                    matchesStatus
                );
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
                <h4>No windows yet</h4>
                <p>Add windows by creating a project.</p>
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

                <span class="project-window-count">
                    ${escapeHtml(item.projectNumber)}
                </span>
            </div>

            <div class="window-card-body">

                <p>
                    <strong>Project:</strong>
                    ${escapeHtml(item.projectName)}
                </p>

                <p>
                    <strong>Customer:</strong>
                    ${escapeHtml(item.customerName)}
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

        const windows = getWindows();

        const item = windows.find(
            windowItem =>
                windowItem.id === windowId
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
                `${item.windowNumber}  •  ${item.windowType || "Window"}`;
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

    const w = item.finalWidth || item.width || "-";
    const h = item.finalHeight || item.height || "-";

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
                <p><strong>Customer:</strong> ${escapeHtml(item.customerName)}</p>
                <p><strong>Location:</strong> ${escapeHtml(item.windowLocation || "-")}</p>
                <p><strong>Type:</strong> ${escapeHtml(item.windowType || "-")} &nbsp;•&nbsp; Qty: ${escapeHtml(item.quantity || 1)}</p>
            </div>
            <div class="details-block details-status">
                <span class="status-badge ${statusBadgeClass(item.status)}">${escapeHtml(item.status)}</span>
                ${item.manufacturedBy
            ? `<p class="details-small">Manufactured by: <strong>${escapeHtml(item.manufacturedBy)}</strong></p>`
            : ""}
                ${item.checkedBy
            ? `<p class="details-small">Quality checked by: <strong>${escapeHtml(item.checkedBy)}</strong></p>`
            : ""}
            </div>
        </div>

        <div class="details-measurements">
            <h4>Measurements (mm)</h4>
            <table class="measurement-table">
                <thead>
                    <tr>
                        <th>Measurement</th>
                        <th>Top / Left</th>
                        <th>Middle</th>
                        <th>Bottom / Right</th>
                        <th>Final</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Width</td>
                        <td>${escapeHtml(item.widthTop || "-")}</td>
                        <td>${escapeHtml(item.widthMiddle || "-")}</td>
                        <td>${escapeHtml(item.widthBottom || "-")}</td>
                        <td><strong>${escapeHtml(w)}</strong></td>
                    </tr>
                    <tr>
                        <td>Height</td>
                        <td>${escapeHtml(item.heightLeft || "-")}</td>
                        <td>${escapeHtml(item.heightMiddle || "-")}</td>
                        <td>${escapeHtml(item.heightRight || "-")}</td>
                        <td><strong>${escapeHtml(h)}</strong></td>
                    </tr>
                </tbody>
            </table>
            <p class="details-small">Frame depth: ${escapeHtml(item.measurementDepth || "-")} mm • Opening: ${escapeHtml(item.openingType || "-")}</p>
        </div>

        <div class="details-specs">
            <p><strong>Frame Colour:</strong> ${escapeHtml(item.frameColour)}${item.customFrameColour ? ` (${escapeHtml(item.customFrameColour)})` : ""} • <strong>Series:</strong> ${escapeHtml(item.frameSeries || "-")}</p>
            <p><strong>Glass:</strong> ${escapeHtml(item.glassType || "-")} ${item.glassThickness ? `• Thickness: ${escapeHtml(item.glassThickness)}` : ""}</p>
            ${item.notes ? `<p><strong>Notes:</strong> ${escapeHtml(item.notes)}</p>` : ""}
        </div>

        ${item.photo
            ? `<div class="details-photo"><img src="${item.photo}" alt="Window photo"></div>`
            : ""}

        ${qrHtml}

        <div class="details-actions">
            <button type="button" class="primary-button" onclick="printWindow('${item.id}')">Print Worksheet</button>
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

    const currentIndex = STATUSES.indexOf(item.status);

    const statusButtons = STATUSES.map((status, index) => {

        const isCurrent = status === item.status;
        const isAllowed = index >= currentIndex;

        const cssClass = isCurrent
            ? "tracker-status tracker-current"
            : (isAllowed ? "tracker-status" : "tracker-status tracker-past");

        const label = isCurrent ? `✓ ${status}` : status;

        return `<button type="button" class="${cssClass}" data-status="${status}" ${isCurrent ? "disabled" : ""}>${label}</button>`;
    }).join("");

    const employeeOptions = `<option value="">Select employee</option>` + getEmployeeOptions();

    return `
    <div class="production-tracker">
        <div class="tracker-employee-row">
            <label for="trackerEmployeeSelect">Employee completing this step *</label>
            <select id="trackerEmployeeSelect" class="tracker-employee-select">${employeeOptions}</select>
        </div>
        <div class="tracker-status-row">
            <span class="tracker-label">Update to:</span>
            <div class="tracker-status-buttons">${statusButtons}</div>
        </div>
        ${employees.length === 0
            ? `<p class="tracker-warning">No employees added yet. Add employees in the Employees tab so workshop staff can be assigned to each step.</p>`
            : ""}
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
                <h4>No employees yet</h4>
                <p>Add your workshop staff so they can be assigned to production steps.</p>
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

function windowRowTableHtml(windows) {

    const rows = windows.map((window, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(window.description)}</td>
            <td>${escapeHtml(window.location)}</td>
            <td>${escapeHtml(window.length)} mm</td>
            <td>${escapeHtml(window.width)} mm</td>
            <td>${escapeHtml(window.frameColour)}</td>
            <td class="saved-photo-cell">${savedPhotoHtml(window.photo)}</td>
        </tr>
    `).join("");

    return `
        <div class="window-rows-wrapper">
            <table class="window-rows-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Description</th>
                        <th>Location</th>
                        <th>Length</th>
                        <th>Width</th>
                        <th>Frame Color</th>
                        <th>Photo</th>
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
function savedPhotoHtml(photo) {

    if (!photo) {
        return `<span class="photo-none">No photo</span>`;
    }

    return `<button type="button" class="saved-photo" title="View photo"
        onclick="openPhotoViewer(this)">
        <img src="${escapeHtml(photo)}" alt="Window photo">
    </button>`;
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
                <h4>No projects yet</h4>
                <p>Create a project to capture all of its windows.</p>
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

                <span class="project-window-count">
                    ${windows.length} window${windows.length === 1 ? "" : "s"}
                </span>
            </div>

            <div class="project-card-meta">
                <p><strong>Customer:</strong> ${escapeHtml(project.customerName)}</p>
                <p><strong>Phone:</strong> ${escapeHtml(project.customerPhone || "-")}</p>
                <p><strong>Email:</strong> ${escapeHtml(project.customerEmail || "-")}</p>
                <p><strong>Site:</strong> ${escapeHtml(project.siteAddress || "-")}</p>
            </div>

            ${windows.length
                ? windowRowTableHtml(windows)
                : `<p class="details-small">No windows captured on this project.</p>`}

            <div class="window-card-actions">
                <button type="button" class="secondary-button card-action"
                    onclick="printProject('${project.id}')">
                    Print
                </button>

                <button type="button" class="secondary-button card-action"
                    onclick="deleteProject('${project.id}')">
                    Delete
                </button>
            </div>
        `;

        container.appendChild(card);
    });
}

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
                    `${window.description} ${window.location} ${window.frameColour}`
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

        setPrintText("printWindowId", project.projectNumber);
        setPrintText("printProjectName", project.projectName);
        setPrintText("printCustomerName", project.customerName);
        setPrintText("printLocation", project.siteAddress);
        setPrintText("printWindowType", `${windows.length} window(s)`);
        setPrintText("printFrameColour", "See window schedule below");
        setPrintText("printFrameSeries", project.customerPhone);
        setPrintText("printWidth", "-");
        setPrintText("printHeight", "-");
        setPrintText("printGlassType", "-");
        setPrintText("printGlassThickness", "-");

        const photo = $("printPhoto");
        if (photo) {
            photo.src = "";
        }

        /*
           Reuse the worksheet measurement table for the window
           schedule: one row per window with description, location,
           length, width and frame colour.
        */
        const schedule = $("printSchedule");

        if (schedule) {
            schedule.innerHTML = windows.map((window, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(window.description)}</td>
                    <td>${escapeHtml(window.location)}</td>
                    <td>${escapeHtml(window.length)} mm</td>
                    <td>${escapeHtml(window.width)} mm</td>
                    <td>${escapeHtml(window.frameColour)}</td>
                    <td>${window.photo ? `<img class="print-row-photo" src="${escapeHtml(window.photo)}" alt="">` : "-"}</td>
                </tr>
            `).join("") || `<tr><td colspan="7">No windows captured.</td></tr>`;
        }

        setPrintText("printNotes", "-");
        setPrintText("printStatus", windows.length ? "Measured" : "-");
        setPrintText("printDate", new Date().toLocaleDateString("en-ZA"));
        setPrintText("printManufacturer", "");
        setPrintText("printEmployee", "");

        generateQRCode("printQRCode", buildProjectQRContent(project.id));

        setTimeout(() => {
            window.print();
        }, 250);

    } catch (error) {

        console.error("Print project error:", error);

        showError("The project could not be printed.");
    }
}

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
   RECENT WINDOWS
   ========================================================= */

function renderRecentWindows() {

    const container =
        $("recentWindows");

    if (!container) {
        return;
    }

    const windows =
        getAllWindowsWithProject()
            .sort(
                (a, b) =>
                    new Date(b.createdAt) -
                    new Date(a.createdAt)
            )
            .slice(0, 5);

    container.innerHTML = "";

    if (!windows.length) {

        container.innerHTML = `
            <div class="empty-state">
                <h4>No windows yet</h4>
                <p>Create your first window measurement to get started.</p>
            </div>
        `;

        return;
    }

    windows.forEach(item => {

        const row =
            document.createElement("div");

        row.className =
            "recent-window";

        row.innerHTML = `
            <div class="recent-window-main">
                <strong>${escapeHtml(item.description)}</strong>
                <span>${escapeHtml(item.projectName)}</span>
                <small>${escapeHtml(item.location || "No location")} · ${escapeHtml(item.length)}×${escapeHtml(item.width)} mm · ${escapeHtml(item.frameColour)}</small>
            </div>
            <span class="project-window-count">${escapeHtml(item.projectNumber)}</span>
        `;

        row.addEventListener("click", () => {
            switchView("projects");
        });

        container.appendChild(row);
    });
}

/* =========================================================
   RENDER EVERYTHING
   ========================================================= */

function renderAll() {

    try {

        renderDashboard();
        renderRecentWindows();
        renderProjects();
        renderWindowsList();
        renderEmployees();

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

/* =========================================================
   QR SCANNER
   ========================================================= */

let html5QrCode = null;

async function startScanner() {

    try {

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
            const fromQuery = url.searchParams.get("window");
            if (fromQuery) {
                windowKey = fromQuery;
            }
        } catch (parseError) {
            /*
               Not a URL - use the raw scanned value.
            */
        }

        const windows =
            getWindows();

        let item =
            windows.find(
                windowItem =>
                    windowItem.id === windowKey
            );

        if (!item) {

            item =
                windows.find(
                    windowItem =>
                        windowItem.windowNumber ===
                        windowKey
                );
        }

        if (!item) {

            showError(
                "This QR code does not belong to a registered AGA window."
            );

            return;
        }

        window.scannedWindow =
            item;

        showSuccess(
            `${item.windowNumber} found.`
        );

        /*
           Stop scanner after successful scan.
        */
        stopScanner();

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

function printWindow(windowId) {

    try {

        const windows =
            getWindows();

        const item =
            windows.find(
                windowItem =>
                    windowItem.id === windowId
            );

        if (!item) {

            showError(
                "The window could not be found."
            );

            return;
        }

        const w = item.finalWidth || item.width || "-";
        const h = item.finalHeight || item.height || "-";

        /*
           Fill every field on the worksheet.
        */
        setPrintText("printWindowId", item.windowNumber);
        setPrintText("printProjectName", item.projectName);
        setPrintText("printCustomerName", item.customerName);
        setPrintText("printLocation", item.windowLocation);
        setPrintText("printWindowType", item.windowType);
        setPrintText("printFrameColour", item.frameColour + (item.customFrameColour ? ` (${item.customFrameColour})` : ""));
        setPrintText("printFrameSeries", item.frameSeries);
        setPrintText("printWidth", `${w} mm`);
        setPrintText("printHeight", `${h} mm`);
        setPrintText("printGlassType", item.glassType);
        setPrintText("printGlassThickness", item.glassThickness);

        setPrintText("printWidthTop", item.widthTop);
        setPrintText("printWidthMiddle", item.widthMiddle);
        setPrintText("printWidthBottom", item.widthBottom);
        setPrintText("printFinalWidth", `${w} mm`);

        setPrintText("printHeightLeft", item.heightLeft);
        setPrintText("printHeightMiddle", item.heightMiddle);
        setPrintText("printHeightRight", item.heightRight);
        setPrintText("printFinalHeight", `${h} mm`);

        setPrintText("printNotes", item.notes);
        setPrintText("printStatus", item.status);

        const created = new Date(item.createdAt);
        setPrintText("printDate", created.toLocaleDateString("en-ZA"));

        setPrintText("printManufacturer", item.manufacturedBy);
        setPrintText("printEmployee", item.checkedBy || item.manufacturedBy);

        /*
           Photo
        */
        const photo = $("printPhoto");
        if (photo) {
            photo.src = item.photo || "";
        }

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
    "employees"
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
                    resetProjectForm();
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

        const viewAllButton =
            $("viewAllWindowsButton");

        if (viewAllButton) {
            viewAllButton.addEventListener("click", () => {
                switchView("windows");
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

/* =========================================================
   APPLICATION STARTUP
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

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

            initialiseEventListeners();

            /* Start the first project with a single empty window row. */
            addProjectWindowRow();

            renderAll();
            handleDeepLink();

            console.log(
                "AGA Workshop Management System loaded successfully."
            );

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
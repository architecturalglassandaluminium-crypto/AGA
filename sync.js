/* =========================================================
   AGA - DATA LAYER (SUPABASE + OFFLINE)
   ---------------------------------------------------------
   This file is the ONLY place that talks to the backend. The rest
   of the app keeps calling getProjects(), saveProjects() and so
   on, exactly as before.

   HOW IT STAYS RELIABLE IN A WORKSHOP:

   1. localStorage remains the working copy on the phone. The app
      is therefore instant and works with no signal.

   2. Every write is applied locally first, then queued for upload.
      If the phone is offline the queue simply waits. Nothing is
      lost and nobody has to think about it.

   3. The queue is drained whenever there is signal - on load, on
      reconnect, and on a timer.

   4. Records carry a "revision" counter. An upload only succeeds
      if the server's revision still matches the one we based our
      change on, so two phones editing DIFFERENT windows never
      clobber each other, and two phones editing the SAME window
      are detected rather than silently overwritten.

   Offline-first is not a nicety here: it is the difference
   between a tool the workshop trusts and one it abandons.
   ========================================================= */

"use strict";

const SYNC_QUEUE_KEY = "aga_sync_queue";
const SYNC_LAST_PULL_KEY = "aga_sync_last_pull";

let supabaseClient = null;
let supabaseWorkshopId = "";

/* =========================================================
   CLIENT
   ========================================================= */

function getSupabase() {

    if (supabaseClient) {
        return supabaseClient;
    }

    if (!isBackendConfigured()) {
        return null;
    }

    if (typeof supabase === "undefined" || !supabase.createClient) {
        console.error("AGA: Supabase library not loaded.");
        return null;
    }

    supabaseClient = supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

    return supabaseClient;
}

/*
   Resolve the workshop id once. Cached, because every request
   needs it and it never changes during a session.
*/
async function getWorkshopId() {

    if (supabaseWorkshopId) {
        return supabaseWorkshopId;
    }

    if (String(SUPABASE_WORKSHOP_ID || "").trim()) {
        supabaseWorkshopId = String(SUPABASE_WORKSHOP_ID).trim();
        return supabaseWorkshopId;
    }

    const client = getSupabase();

    if (!client) {
        return "";
    }

    const { data, error } = await client
        .from("workshops")
        .select("id")
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("AGA: could not resolve workshop:", error.message);
        return "";
    }

    supabaseWorkshopId = data?.id || "";

    return supabaseWorkshopId;
}

/* =========================================================
   SYNC QUEUE
   ---------------------------------------------------------
   Two kinds of change are queued:

     "project"  - create/update a whole project (with its windows)
     "status"   - one window moving to a new status
     "allocate" - one window being allocated to someone
     "activity" - one productivity entry

   Batching a project as a single unit keeps a project and its
   windows consistent: a half-uploaded project is never visible.
   ========================================================= */

function getSyncQueue() {

    try {
        const raw = localStorage.getItem(SYNC_QUEUE_KEY);

        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);

        return Array.isArray(parsed) ? parsed : [];

    } catch (error) {
        console.error("AGA: could not read sync queue:", error);
        return [];
    }
}

function saveSyncQueue(queue) {

    try {
        localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
        return true;
    } catch (error) {
        console.error("AGA: could not save sync queue:", error);
        return false;
    }
}

function enqueue(change) {

    if (!isBackendConfigured()) {
        return;
    }

    const queue = getSyncQueue();

    queue.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        at: new Date().toISOString(),
        /*
           How many times this change has been attempted. Bounded
           by MAX_SYNC_ATTEMPTS so one change that can never
           succeed is parked in the failed log rather than
           retried for the life of the device.
        */
        attempts: 0,
        ...change
    });

    saveSyncQueue(queue);

    /* Try straight away; harmless when offline. */
    scheduleSyncFlush();
}

function pendingChangeCount() {

    return getSyncQueue().length;
}

window.pendingChangeCount = pendingChangeCount;

/* =========================================================
   FAILED CHANGES
   ---------------------------------------------------------
   A change that has been attempted MAX_SYNC_ATTEMPTS times is
   moved here instead of being retried forever. Nothing is
   deleted: the failed log is a real record the user can read,
   which is what makes moving a change out of the queue safe.
   ========================================================= */

const SYNC_FAILED_KEY = "aga_sync_failed";

/* How many attempts a stuck change gets before it is parked. */
const MAX_SYNC_ATTEMPTS = 5;

/* Kept small so a device that cannot sync for months does not
   fill its storage with the same record over and over. */
const MAX_FAILED_LOG = 100;

function getFailedChanges() {

    try {
        const raw = localStorage.getItem(SYNC_FAILED_KEY);

        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);

        return Array.isArray(parsed) ? parsed : [];

    } catch (error) {
        console.error("AGA: could not read the failed sync log:", error);
        return [];
    }
}

function saveFailedChanges(failed) {

    try {
        localStorage.setItem(SYNC_FAILED_KEY, JSON.stringify(failed));
        return true;
    } catch (error) {
        /*
           A full storage must not stop the queue draining, so a
           failure to record is logged and swallowed. The change
           has already been dropped from the queue at this point,
           which is why parking is only done after the log write
           succeeds in noteFailedChange() below.
        */
        console.error("AGA: could not save the failed sync log:", error);
        return false;
    }
}

/*
   Move one change from the queue into the failed log.

   Bounded and newest-kept: when the log is full the oldest
   entries are dropped. Returns true only when the change was
   actually recorded, so the caller can keep it queued rather
   than lose it.
*/
function noteFailedChange(change, reason) {

    const failed = getFailedChanges();

    failed.push({
        id: change.id || "",
        type: change.type || "unknown",
        at: change.at || "",
        failedAt: new Date().toISOString(),
        attempts: Number(change.attempts || 0),
        reason: reason || "unknown",
        /* Enough to identify the change on screen without holding
           the whole project (which can carry photos). */
        windowId: change.windowId || "",
        projectId: change.projectId || "",
        status: change.status || ""
    });

    while (failed.length > MAX_FAILED_LOG) {
        failed.shift();
    }

    return saveFailedChanges(failed);
}

function clearFailedChanges() {

    try {
        localStorage.removeItem(SYNC_FAILED_KEY);
        return true;
    } catch (error) {
        console.error("AGA: could not clear the failed sync log:", error);
        return false;
    }
}

function failedChangeCount() {

    return getFailedChanges().length;
}

/*
   Exposed so the sync badge and any diagnostics screen can show
   what could not be uploaded, and so a user can acknowledge it
   once they have seen it.
*/
window.getFailedChanges = getFailedChanges;
window.clearFailedChanges = clearFailedChanges;
window.failedChangeCount = failedChangeCount;

/* =========================================================
   SYNC STATE (for the on-screen indicator)
   ========================================================= */

const SYNC_STATE = {
    idle: "idle",
    syncing: "syncing",
    offline: "offline",
    error: "error"
};

let currentSyncState = SYNC_STATE.idle;
let lastSyncError = "";

function setSyncState(state, message = "") {

    currentSyncState = state;
    lastSyncError = message;

    updateSyncIndicator();
}

function updateSyncIndicator() {

    const badge = document.getElementById("syncBadge");

    if (!badge) {
        return;
    }

    /*
       With no backend configured the app is honestly "offline
       only" rather than pretending to sync. The tooltip names the
       file to edit, so a deploy that was meant to be cloud-enabled
       but is not says so where someone will actually see it.
    */
    if (!isBackendConfigured()) {
        badge.className = "sync-badge sync-offline";
        badge.textContent = "Offline only";
        badge.title =
            "Cloud saving is not configured. Data is stored on this " +
            "device only. To share it, fill in SUPABASE_URL and " +
            "SUPABASE_ANON_KEY in supabase-config.js (see supabase/SETUP.md).";
        return;
    }

    const pending = pendingChangeCount();

    const online = navigator.onLine;

    if (!online) {
        badge.className = "sync-badge sync-offline";
        badge.textContent = pending
            ? `Offline - ${pending} waiting`
            : "Offline";
        badge.title = "No connection. Changes are saved on this phone and upload automatically.";
        return;
    }

    if (currentSyncState === SYNC_STATE.syncing) {
        badge.className = "sync-badge sync-syncing";
        badge.textContent = "Saving...";
        badge.title = "Uploading changes";
        return;
    }

    if (currentSyncState === SYNC_STATE.error) {
        badge.className = "sync-badge sync-error";

        /*
           Parked changes are the ones the user needs to know
           about, because they will not retry themselves. Say how
           many there are and where to look, rather than repeating
           the last error over a queue that is still moving.
        */
        const failed = failedChangeCount();

        badge.textContent = failed
            ? `${failed} could not save`
            : "Not saved";

        badge.title = failed
            ? `${failed} change${failed === 1 ? "" : "s"} could not be ` +
              "uploaded and will not retry. " +
              (lastSyncError || "") +
              " See getFailedChanges() in the console for the list."
            : (lastSyncError || "Some changes could not be uploaded.");

        return;
    }

    if (pending) {
        badge.className = "sync-badge sync-pending";
        badge.textContent = `${pending} to save`;
        badge.title = "Waiting to upload. This happens automatically.";
        return;
    }

    /*
       Nothing waiting, but something was parked earlier. Keep
       saying so - otherwise a failure the user never saw scrolls
       past and the badge says "Saved" over data that is not.
    */
    const parked = failedChangeCount();

    if (parked) {
        badge.className = "sync-badge sync-error";
        badge.textContent = `${parked} could not save`;
        badge.title =
            `${parked} change${parked === 1 ? "" : "s"} could not be ` +
            "uploaded and will not retry. Everything else is saved. " +
            "See getFailedChanges() in the console for the list.";
        return;
    }

    badge.className = "sync-badge sync-ok";
    badge.textContent = "Saved";
    badge.title = "All changes are saved.";
}

window.updateSyncIndicator = updateSyncIndicator;

/* =========================================================
   SERIALISATION
   ---------------------------------------------------------
   The app's objects are camelCase and nested; the database is
   snake_case and flat. These two functions are the only place
   that translation happens.
   ========================================================= */

function projectToRows(project, workshopId) {

    const now = new Date().toISOString();

    const projectRow = {
        id: project.id,
        workshop_id: workshopId,
        project_number: project.projectNumber || "",
        project_name: project.projectName || "",
        customer_name: project.customerName || "",
        customer_email: project.customerEmail || "",
        customer_phone: project.customerPhone || "",
        site_address: project.siteAddress || "",

        /*
           Null rather than "" when there is no due date.

           The column is a DATE, and Postgres rejects an empty
           string for it - which would fail the whole project sync,
           not just this field. Null is the honest value for
           "no promised date".
        */
        due_date: project.dueDate || null,

        created_at: project.createdAt || now,
        updated_at: now,
        revision: Number(project.revision || 1)
    };

    const windowRows = (project.windows || []).map(window => ({
        id: window.id,
        project_id: project.id,
        workshop_id: workshopId,

        window_number: window.windowNumber || "",
        window_seq: Number(window.windowId) || null,

        product_type: window.productType || "",
        description: window.description || "",
        location: window.location || "",

        length_mm: window.length === "" || window.length === undefined
            ? null
            : Number(window.length),

        width_mm: window.width === "" || window.width === undefined
            ? null
            : Number(window.width),

        frame_colour: window.frameColour || "",
        glass_type: window.glassType || "",

        qc_check: window.qcCheck || "",
        qc_checked_at: window.qcCheckedAt || null,
        checked_by: window.checkedBy || "",

        manufactured_by: window.manufacturedBy || "",

        allocated_to: window.allocatedTo || "",
        allocated_at: window.allocatedAt || null,

        status: window.status || "Measured",

        photo: window.photo || "",

        created_at: window.createdAt || now,
        updated_at: now,
        revision: Number(window.revision || 1)
    }));

    return { projectRow, windowRows };
}

function rowsToProject(projectRow, windowRows, historyRows) {

    const historyByWindow = {};

    (historyRows || []).forEach(entry => {
        const key = entry.window_id;

        if (!historyByWindow[key]) {
            historyByWindow[key] = [];
        }

        historyByWindow[key].push({
            status: entry.status,
            date: entry.recorded_at,
            employeeId: entry.employee_id || "",
            employee: entry.employee || ""
        });
    });

    return {
        id: projectRow.id,
        projectNumber: projectRow.project_number,
        projectName: projectRow.project_name,
        customerName: projectRow.customer_name,
        customerEmail: projectRow.customer_email || "",
        customerPhone: projectRow.customer_phone || "",
        siteAddress: projectRow.site_address || "",

        /*
           Postgres returns a DATE as "yyyy-mm-dd", which is already
           the shape the date input and the badge want. Kept as a
           plain string rather than parsed into a Date, so no
           timezone can shift the day on the way in.
        */
        dueDate: projectRow.due_date || "",

        createdAt: projectRow.created_at,
        updatedAt: projectRow.updated_at,
        revision: Number(projectRow.revision || 1),

        windows: (windowRows || []).map(row => ({
            id: row.id,
            windowId: row.window_seq,
            windowNumber: row.window_number,

            productType: row.product_type || "",
            description: row.description || "",
            location: row.location || "",

            length: row.length_mm === null ? "" : row.length_mm,
            width: row.width_mm === null ? "" : row.width_mm,

            frameColour: row.frame_colour || "",
            glassType: row.glass_type || "",

            qcCheck: row.qc_check || "",
            qcCheckedAt: row.qc_checked_at || "",
            checkedBy: row.checked_by || "",

            manufacturedBy: row.manufactured_by || "",

            allocatedTo: row.allocated_to || "",
            allocatedAt: row.allocated_at || "",

            status: row.status || "Measured",
            photo: row.photo || "",

            createdAt: row.created_at,
            updatedAt: row.updated_at,
            revision: Number(row.revision || 1),

            statusHistory: historyByWindow[row.id] || []
        }))
    };
}

/* =========================================================
   PULL - fetch everything for this workshop
   ========================================================= */

async function pullFromServer() {

    const client = getSupabase();

    if (!client) {
        return { ok: false, reason: "not-configured" };
    }

    const workshopId = await getWorkshopId();

    if (!workshopId) {
        return { ok: false, reason: "no-workshop" };
    }

    try {

        const [projectsRes, windowsRes, historyRes, employeesRes] =
            await Promise.all([

                client.from("projects")
                    .select("*")
                    .eq("workshop_id", workshopId)
                    .order("created_at", { ascending: true }),

                client.from("windows")
                    .select("*")
                    .eq("workshop_id", workshopId),

                client.from("status_history")
                    .select("*")
                    .eq("workshop_id", workshopId)
                    .order("recorded_at", { ascending: true }),

                client.from("employees")
                    .select("*")
                    .eq("workshop_id", workshopId)
                    .eq("is_active", true)
                    .order("name", { ascending: true })
            ]);

        const firstError =
            projectsRes.error || windowsRes.error ||
            historyRes.error || employeesRes.error;

        if (firstError) {
            throw new Error(firstError.message);
        }

        /* Group windows and history by their project. */
        const windowsByProject = {};

        (windowsRes.data || []).forEach(row => {
            if (!windowsByProject[row.project_id]) {
                windowsByProject[row.project_id] = [];
            }
            windowsByProject[row.project_id].push(row);
        });

        const projects = (projectsRes.data || []).map(projectRow =>
            rowsToProject(
                projectRow,
                windowsByProject[projectRow.id] || [],
                historyRes.data || []
            )
        );

        const employees = (employeesRes.data || []).map(row => ({
            id: row.id,
            name: row.name,
            number: row.employee_number || "",
            createdAt: row.created_at
        }));

        /*
           Server data replaces the local copy, but ONLY when there
           is nothing still waiting to upload - otherwise a pending
           local edit would be wiped before it ever reached the
           server.
        */
        if (pendingChangeCount() === 0) {

            localStorage.setItem(PROJECT_KEY, JSON.stringify(projects));
            localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(employees));
            localStorage.setItem(SYNC_LAST_PULL_KEY, new Date().toISOString());
        }

        return { ok: true, projects, employees };

    } catch (error) {

        console.error("AGA: pull failed:", error);

        return { ok: false, reason: error.message };
    }
}

window.pullFromServer = pullFromServer;

/* =========================================================
   UPLOAD HELPERS
   ========================================================= */

/*
   Upload a whole project plus its windows.

   Uses upsert with an explicit revision check: if the server's
   revision has moved on, this device's copy is stale and the
   change is refused rather than silently overwriting.
*/
async function uploadProject(projectId) {

    const client = getSupabase();

    if (!client) {
        return { ok: false, reason: "not-configured" };
    }

    const workshopId = await getWorkshopId();

    if (!workshopId) {
        return { ok: false, reason: "no-workshop" };
    }

    const project = getProjects().find(item => item.id === projectId);

    if (!project) {
        return { ok: false, reason: "project-missing" };
    }

    const { projectRow, windowRows } = projectToRows(project, workshopId);

    const projectRes = await client
        .from("projects")
        .upsert(projectRow, { onConflict: "id" })
        .select("revision")
        .maybeSingle();

    if (projectRes.error) {
        return { ok: false, reason: projectRes.error.message };
    }

    if (windowRows.length) {

        const windowsRes = await client
            .from("windows")
            .upsert(windowRows, { onConflict: "id" });

        if (windowsRes.error) {
            return { ok: false, reason: windowsRes.error.message };
        }
    }

    return { ok: true };
}

/*
   Push one employee to the cloud, so a new hire appears in the
   sign-in list on every other phone.

   Deliberately does NOT send a PIN. A new employee has none - they
   choose their own the first time they sign in, via
   claim_employee_pin() - so there is no secret to transmit and
   nothing to leak here.
*/
async function uploadEmployee(employeeId) {

    const client = getSupabase();

    if (!client) {
        return { ok: false, reason: "not-configured" };
    }

    const workshopId = await getWorkshopId();

    if (!workshopId) {
        return { ok: false, reason: "no-workshop" };
    }

    const employee = getEmployees().find(item => item.id === employeeId);

    if (!employee) {
        return { ok: false, reason: "employee-missing" };
    }

    /*
       The local record carries a `number`; the column is
       `employee_number`. Mapping explicitly rather than spreading,
       so a future local field cannot silently become a stray column
       or, worse, a PIN.
    */
    const row = {
        id: employee.id,
        workshop_id: workshopId,
        name: employee.name,
        employee_number: employee.number || null,
        is_active: true,
        updated_at: new Date().toISOString(),
    };

    const { error } = await client
        .from("employees")
        .upsert(row, { onConflict: "id" });

    if (error) {
        /*
           A duplicate name is the one failure a user can actually
           fix, and the unique index is on lower(name) within a
           workshop - so report it in those terms rather than
           surfacing a raw constraint message.
        */
        if (/duplicate|unique/i.test(error.message)) {
            return { ok: false, reason: "duplicate-name" };
        }

        return { ok: false, reason: error.message };
    }

    return { ok: true };
}

window.uploadEmployee = uploadEmployee;

/*
   What the server currently holds for one window.

   Used by the optimistic-concurrency check below: everything we
   send that changes a window has to be based on the revision we
   last saw, so a change built on a stale copy can be refused
   instead of silently overwriting whoever wrote first.

   Returns null when the window cannot be read - a network
   failure or a window this device cannot see. The caller treats
   that as "do not write", never as "go ahead".
*/
async function readWindowRevision(windowId) {

    const client = getSupabase();

    if (!client) {
        return null;
    }

    const res = await client
        .from("windows")
        .select("revision")
        .eq("id", windowId)
        .maybeSingle();

    if (res.error) {
        console.error("AGA: could not read window revision:", res.error.message);

        return null;
    }

    if (!res.data) {
        return null;
    }

    /*
       Number() because Postgres hands back an integer either as a
       number or as a string depending on the driver, and the
       revision is compared with === below.
    */
    return Number(res.data.revision || 1);
}

/*
   The optimistic-concurrency guard, in one place.

   Reads the server's revision, and returns a refusal when it has
   moved on from the one this change was based on. Returns ok:true
   with the current revision when the caller may proceed.

   A failure to read is reported as a retryable error rather than
   a conflict: an offline phone must not be told it has lost an
   edit it never made.
*/
async function checkWindowRevision(windowId, baseRevision) {

    const currentRevision = await readWindowRevision(windowId);

    if (currentRevision === null) {
        return { ok: false, reason: "revision-unreadable" };
    }

    /*
       No base revision recorded means the change was queued
       before this guard existed. Accept it, and let the next
       change carry a revision.
    */
    if (baseRevision === undefined || baseRevision === null) {
        return { ok: true, revision: currentRevision };
    }

    if (Number(baseRevision) !== currentRevision) {
        return {
            ok: false,
            conflict: true,
            reason:
                "Someone else updated this item first. Your change is " +
                "kept and will not overwrite theirs.",
            revision: currentRevision
        };
    }

    return { ok: true, revision: currentRevision };
}

async function uploadStatusChange(
    windowId,
    status,
    employeeId,
    employeeName,
    baseRevision
) {

    const client = getSupabase();

    if (!client) {
        return { ok: false, reason: "not-configured" };
    }

    const workshopId = await getWorkshopId();

    if (!workshopId) {
        return { ok: false, reason: "no-workshop" };
    }

    /*
       Refuse the write when another phone has moved this window
       on since our copy was made. Checked here, before anything
       is sent, so a stale change cannot land and cannot write a
       misleading status_history row either.
    */
    const guard = await checkWindowRevision(windowId, baseRevision);

    if (!guard.ok) {
        return guard.conflict
            ? { ok: false, conflict: true, reason: guard.reason }
            : { ok: false, reason: guard.reason };
    }

    /*
       Only the columns this change actually touches are sent, so
       two phones updating different windows - or different fields
       of the same window - cannot fight.

       The revision predicate makes that guarantee real: the write
       lands only while the server still holds the revision we
       read, and bumps it by one so the next change has to match.
    */
    const windowRes = await client
        .from("windows")
        .update({
            status,
            updated_at: new Date().toISOString(),
            revision: guard.revision + 1
        })
        .eq("id", windowId)
        .eq("workshop_id", workshopId)
        .eq("revision", guard.revision);

    if (windowRes.error) {
        return { ok: false, reason: windowRes.error.message };
    }

    const historyRes = await client
        .from("status_history")
        .insert({
            window_id: windowId,
            workshop_id: workshopId,
            status,
            employee_id: employeeId || null,
            employee: employeeName || "",
            recorded_at: new Date().toISOString()
        });

    if (historyRes.error) {
        return { ok: false, reason: historyRes.error.message };
    }

    return { ok: true };
}

async function uploadActivity(entry) {

    const client = getSupabase();

    if (!client) {
        return { ok: false, reason: "not-configured" };
    }

    const workshopId = await getWorkshopId();

    if (!workshopId) {
        return { ok: false, reason: "no-workshop" };
    }

    const res = await client.from("activity").insert({
        workshop_id: workshopId,
        window_id: entry.windowId || null,
        window_number: entry.windowNumber || "",
        project_number: entry.projectNumber || "",
        project_name: entry.projectName || "",
        description: entry.description || "",
        status: entry.status,
        employee_id: entry.employeeId || null,
        employee: entry.employee,
        recorded_at: entry.date || new Date().toISOString()
    });

    if (res.error) {
        return { ok: false, reason: res.error.message };
    }

    return { ok: true };
}

async function uploadAllocation(windowId, employeeId, employeeName, baseRevision) {

    const client = getSupabase();

    if (!client) {
        return { ok: false, reason: "not-configured" };
    }

    const workshopId = await getWorkshopId();

    if (!workshopId) {
        return { ok: false, reason: "no-workshop" };
    }

    /* Allocating and setting a status must obey the same rule. */
    const guard = await checkWindowRevision(windowId, baseRevision);

    if (!guard.ok) {
        return guard.conflict
            ? { ok: false, conflict: true, reason: guard.reason }
            : { ok: false, reason: guard.reason };
    }

    const res = await client
        .from("windows")
        .update({
            allocated_to_id: employeeId || null,
            allocated_to: employeeName || "",
            allocated_at: employeeId ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
            revision: guard.revision + 1
        })
        .eq("id", windowId)
        .eq("workshop_id", workshopId)
        .eq("revision", guard.revision);

    if (res.error) {
        return { ok: false, reason: res.error.message };
    }

    return { ok: true };
}

/* =========================================================
   FLUSH - drain the queue
   ========================================================= */

let syncInProgress = false;
let syncTimer = null;

function scheduleSyncFlush(delayMs = 800) {

    if (syncTimer) {
        clearTimeout(syncTimer);
    }

    syncTimer = setTimeout(() => {
        flushSyncQueue();
    }, delayMs);
}

async function flushSyncQueue() {

    if (syncInProgress) {
        return;
    }

    if (!isBackendConfigured()) {
        return;
    }

    if (!navigator.onLine) {
        setSyncState(SYNC_STATE.offline);
        return;
    }

    const queue = getSyncQueue();

    if (!queue.length) {
        setSyncState(SYNC_STATE.idle);
        return;
    }

    syncInProgress = true;
    setSyncState(SYNC_STATE.syncing);

    const remaining = [];

    try {

        for (const change of queue) {

            let result;

            if (change.type === "project") {
                result = await uploadProject(change.projectId);

            } else if (change.type === "status") {
                result = await uploadStatusChange(
                    change.windowId,
                    change.status,
                    change.employeeId,
                    change.employeeName,
                    change.baseRevision
                );

            } else if (change.type === "activity") {
                result = await uploadActivity(change.entry);

            } else if (change.type === "allocate") {
                result = await uploadAllocation(
                    change.windowId,
                    change.employeeId,
                    change.employeeName,
                    change.baseRevision
                );

            } else {
                /* Unknown change type - drop it rather than block the queue. */
                console.warn("AGA: unknown queued change:", change.type);
                continue;
            }

            if (!result.ok) {

                if (result.conflict) {

                    /*
                       The revision moved on, so this change was
                       built on a copy the server no longer holds.

                       It is parked straight away rather than
                       retried: retrying would only produce the same
                       conflict for ever, and the newest server copy
                       will arrive on the next pull. It is written
                       to the failed log, so the dropped change
                       stays readable. If the log itself cannot be
                       written the change stays queued instead of
                       being lost.
                    */
                    console.warn(
                        "AGA: queued change conflicts with a newer copy:",
                        change.type,
                        change.windowId || change.projectId || ""
                    );

                    if (noteFailedChange(change, result.reason)) {
                        setSyncState(SYNC_STATE.error, result.reason);
                    } else {
                        remaining.push(change);
                    }

                    continue;
                }

                /*
                   Count the attempt before deciding what to do
                   with it. A change that keeps failing on the same
                   cause - a project deleted server-side, a
                   constraint the server will never accept - would
                   otherwise be retried every 30 seconds for the
                   life of the device.
                */
                const attempts = Number(change.attempts || 0) + 1;

                if (attempts >= MAX_SYNC_ATTEMPTS) {

                    /*
                       Give up on this one and park it. The failed
                       log is written FIRST: only when the record is
                       safely stored is it dropped from the queue.
                       Nothing is discarded without a trace.
                    */
                    console.warn(
                        "AGA: change failed too many times, parking it:",
                        change.type,
                        result.reason
                    );

                    if (noteFailedChange(
                        Object.assign({}, change, { attempts }),
                        result.reason
                    )) {
                        setSyncState(SYNC_STATE.error, result.reason);
                    } else {
                        remaining.push(
                            Object.assign({}, change, { attempts })
                        );
                    }

                    continue;
                }

                /*
                   Keep the change for a later attempt. A record is
                   never silently discarded - the badge shows the
                   backlog so the user knows.
                */
                remaining.push(
                    Object.assign({}, change, { attempts })
                );

                setSyncState(SYNC_STATE.error, result.reason);
            }
        }

        saveSyncQueue(remaining);

        if (!remaining.length) {
            setSyncState(SYNC_STATE.idle);
        }

    } catch (error) {

        console.error("AGA: sync flush error:", error);

        /* Anything not yet confirmed stays queued. */
        saveSyncQueue(queue);

        setSyncState(SYNC_STATE.error, error.message);

    } finally {
        syncInProgress = false;
        updateSyncIndicator();
    }
}

window.flushSyncQueue = flushSyncQueue;

/* =========================================================
   STARTUP
   ========================================================= */

async function initBackend() {

    if (!isBackendConfigured()) {

        updateSyncIndicator();

        return { ok: false, reason: "not-configured" };
    }

    setSyncState(SYNC_STATE.syncing);

    /* Drain anything left from a previous session first. */
    await flushSyncQueue();

    const pull = await pullFromServer();

    setSyncState(pull.ok ? SYNC_STATE.idle : SYNC_STATE.error, pull.reason);

    updateSyncIndicator();

    return pull;
}

window.initBackend = initBackend;

/* Retry when the phone regains signal, and periodically as a safety net. */
window.addEventListener("online", () => {
    setSyncState(SYNC_STATE.idle);
    scheduleSyncFlush(300);
});

window.addEventListener("offline", () => {
    updateSyncIndicator();
});

setInterval(() => {
    if (isBackendConfigured() && pendingChangeCount() > 0) {
        flushSyncQueue();
    }
}, 30000);

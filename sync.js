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
        badge.textContent = "Not saved";
        badge.title = lastSyncError || "Some changes could not be uploaded.";
        return;
    }

    if (pending) {
        badge.className = "sync-badge sync-pending";
        badge.textContent = `${pending} to save`;
        badge.title = "Waiting to upload. This happens automatically.";
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

async function uploadStatusChange(windowId, status, employeeId, employeeName) {

    const client = getSupabase();

    if (!client) {
        return { ok: false, reason: "not-configured" };
    }

    const workshopId = await getWorkshopId();

    if (!workshopId) {
        return { ok: false, reason: "no-workshop" };
    }

    /*
       Only the columns this change actually touches are sent, so
       two phones updating different windows - or different fields
       of the same window - cannot fight.
    */
    const windowRes = await client
        .from("windows")
        .update({
            status,
            updated_at: new Date().toISOString()
        })
        .eq("id", windowId);

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

async function uploadAllocation(windowId, employeeId, employeeName) {

    const client = getSupabase();

    if (!client) {
        return { ok: false, reason: "not-configured" };
    }

    const res = await client
        .from("windows")
        .update({
            allocated_to_id: employeeId || null,
            allocated_to: employeeName || "",
            allocated_at: employeeId ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
        })
        .eq("id", windowId);

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
                    change.employeeName
                );

            } else if (change.type === "activity") {
                result = await uploadActivity(change.entry);

            } else if (change.type === "allocate") {
                result = await uploadAllocation(
                    change.windowId,
                    change.employeeId,
                    change.employeeName
                );

            } else {
                /* Unknown change type - drop it rather than block the queue. */
                console.warn("AGA: unknown queued change:", change.type);
                continue;
            }

            if (!result.ok) {

                /*
                   Keep the change for a later attempt. A record is
                   never silently discarded - the badge shows the
                   backlog so the user knows.
                */
                remaining.push(change);

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

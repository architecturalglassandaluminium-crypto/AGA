/* =========================================================
   AGA - SIGN IN (PIN)
   ---------------------------------------------------------
   Staff pick their name and enter a short PIN. The session is
   remembered on that phone, so the PIN is entered once per
   device rather than on every scan - which matters when hands
   are full of aluminium and swarf.

   WHAT THIS PROTECTS AGAINST:
     * Someone recording work as a colleague, which would make
       the productivity figures meaningless.
     * A stranger picking up a phone and writing to the job.

   WHAT IT DOES NOT PROTECT AGAINST:
     * A colleague who knows another's PIN. This is a workshop
       convenience login, not bank-grade security. The database
       policies are the real boundary.

   The PIN is verified by the database (see supabase/schema.sql),
   never in this file, so the PIN list is not readable from the
   phone.
   ========================================================= */

"use strict";

const SESSION_KEY = "aga_session";

/* =========================================================
   SESSION
   ========================================================= */

function getSession() {

    try {
        const raw = localStorage.getItem(SESSION_KEY);

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);

        if (!parsed || !parsed.employeeId) {
            return null;
        }

        return parsed;

    } catch (error) {
        console.error("AGA: could not read session:", error);
        return null;
    }
}

function saveSession(session) {

    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return true;
    } catch (error) {
        console.error("AGA: could not save session:", error);
        return false;
    }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

function signedInName() {

    const session = getSession();

    return session ? session.name : "";
}

window.getSession = getSession;
window.signedInName = signedInName;

/* =========================================================
   UI
   ========================================================= */

function showSignIn(message = "") {

    const overlay = document.getElementById("signInOverlay");

    if (overlay) {
        overlay.hidden = false;
    }

    const signOut = document.getElementById("signOutButton");

    if (signOut) {
        signOut.hidden = true;
    }

    if (message) {
        setSignInMessage(message, "error");
    }
}

function hideSignIn() {

    const overlay = document.getElementById("signInOverlay");

    if (overlay) {
        overlay.hidden = true;
    }

    const signOut = document.getElementById("signOutButton");

    if (signOut) {
        signOut.hidden = false;
    }
}

function setSignInMessage(text, kind = "") {

    const message = document.getElementById("signInMessage");

    if (!message) {
        return;
    }

    message.textContent = text;

    message.className = "signin-message" +
        (kind ? ` signin-message-${kind}` : "");
}

/*
   Fill the name list from the employees table.
*/
async function renderSignInEmployees() {

    const select = document.getElementById("signInEmployee");

    if (!select) {
        return;
    }

    const client = getSupabase();

    if (!client) {
        showSignIn("No backend configured. The app will run offline on this device.");
        return;
    }

    const workshopId = await getWorkshopId();

    if (!workshopId) {
        showSignIn("Could not reach the workshop. Check the internet connection.");
        return;
    }

    const { data, error } = await client
        .from("employees")
        .select("id, name, employee_number")
        .eq("workshop_id", workshopId)
        .eq("is_active", true)
        .order("name", { ascending: true });

    if (error) {
        console.error("AGA: could not load employees:", error.message);
        showSignIn("Could not load the team list. Check the internet connection.");
        return;
    }

    if (!data || !data.length) {
        select.innerHTML = `<option value="">No employees set up yet</option>`;
        showSignIn("No staff have been added yet. Add them in Supabase first.");
        return;
    }

    select.innerHTML = `<option value="">Select your name...</option>` +
        data.map(row =>
            `<option value="${row.id}">${row.name}${row.employee_number ? ` (${row.employee_number})` : ""}</option>`
        ).join("");

    setSignInMessage("Choose your name to continue.");
}

/* =========================================================
   VERIFY
   ========================================================= */

async function attemptSignIn() {

    const select = document.getElementById("signInEmployee");
    const pinInput = document.getElementById("signInPin");
    const button = document.getElementById("signInButton");

    if (!select || !pinInput) {
        return;
    }

    const employeeId = select.value;
    const pin = pinInput.value.trim();

    if (!employeeId) {
        setSignInMessage("Please choose your name.", "error");
        return;
    }

    if (!/^[0-9]{4,6}$/.test(pin)) {
        setSignInMessage("Your PIN is 4 to 6 digits.", "error");
        pinInput.focus();
        return;
    }

    const client = getSupabase();

    if (!client) {
        setSignInMessage("Cannot sign in without a connection.", "error");
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Checking...";
    }

    try {

        /*
           The check happens in the database. The PIN never travels
           anywhere it could be read from this file, and a wrong
           PIN gives the same message whether or not the employee
           exists - so nobody can discover staff names by probing.
        */
        const { data, error } = await client.rpc("verify_employee_pin", {
            p_employee_id: employeeId,
            p_pin: pin
        });

        if (error) {
            throw new Error(error.message);
        }

        if (!data || !data.length) {
            setSignInMessage("That PIN is not correct. Please try again.", "error");
            pinInput.value = "";
            pinInput.focus();
            return;
        }

        const employee = data[0];

        saveSession({
            employeeId: employee.id,
            name: employee.name,
            employeeNumber: employee.employee_number || "",
            signedInAt: new Date().toISOString()
        });

        pinInput.value = "";

        hideSignIn();

        await startApp();

    } catch (error) {

        console.error("AGA: sign-in failed:", error);

        setSignInMessage(
            navigator.onLine
                ? "Could not sign in. Please try again."
                : "No internet connection. Sign in needs a connection.",
            "error"
        );

    } finally {

        if (button) {
            button.disabled = false;
            button.textContent = "Sign in";
        }
    }
}

/* =========================================================
   SIGN OUT
   ========================================================= */

function signOut() {

    const confirmed = confirm(
        "Sign out of this phone?\n\nAny unsaved work will be uploaded first."
    );

    if (!confirmed) {
        return;
    }

    /*
       Try to push anything still queued before dropping the
       session, so a worker leaving at the end of a shift does not
       strand their last scans on the phone.
    */
    if (typeof flushSyncQueue === "function") {
        flushSyncQueue().finally(() => {
            clearSession();
            window.location.reload();
        });

        return;
    }

    clearSession();
    window.location.reload();
}

window.signOut = signOut;

/* =========================================================
   BOOT
   ========================================================= */

function initialiseSignIn() {

    const select = document.getElementById("signInEmployee");
    const pinInput = document.getElementById("signInPin");
    const pinField = document.getElementById("signInPinField");
    const button = document.getElementById("signInButton");
    const signOutButton = document.getElementById("signOutButton");

    if (select) {

        select.addEventListener("change", () => {

            /* Reveal the PIN box only once a name is chosen. */
            if (pinField) {
                pinField.hidden = !select.value;
            }

            if (select.value) {

                setSignInMessage("Enter your PIN.");

                if (pinInput) {
                    pinInput.focus();
                }
            }
        });
    }

    if (pinInput) {

        /* Enter submits, so a PIN can be typed one-handed. */
        pinInput.addEventListener("keydown", event => {

            if (event.key === "Enter") {
                event.preventDefault();
                attemptSignIn();
            }
        });
    }

    if (button) {
        button.addEventListener("click", attemptSignIn);
    }

    if (signOutButton) {
        signOutButton.addEventListener("click", signOut);
    }
}

window.initialiseSignIn = initialiseSignIn;

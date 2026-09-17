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

/*
   Is this person choosing a PIN for the first time?

   Asked the moment a name is picked, because the form has to look
   different: "Choose your PIN" with a confirmation box, versus
   "Enter your PIN" without one.

   If the question cannot be answered - offline, or the function is
   not deployed yet - assume NO and fall through to a normal sign-in.
   That is the safe direction: an un-enrolled person gets "PIN not
   correct" and asks a supervisor, whereas wrongly assuming
   enrolment would let anyone overwrite a real PIN.
*/
async function needsEnrolment(employeeId) {

    const client = getSupabase();

    if (!client || !employeeId) {
        return false;
    }

    try {

        const { data, error } = await client.rpc("employee_needs_pin", {
            p_employee_id: employeeId
        });

        if (error) {
            console.error("AGA: could not check enrolment:", error.message);
            return false;
        }

        return data === true;

    } catch (error) {

        console.error("AGA: enrolment check failed:", error);

        return false;
    }
}

/*
   Switch the form between signing in and enrolling.
*/
function setEnrolmentMode(on) {

    const label = document.getElementById("signInPinLabel");
    const confirmField = document.getElementById("signInPinConfirmField");
    const confirmInput = document.getElementById("signInPinConfirm");
    const button = document.getElementById("signInButton");
    const note = document.getElementById("signInNote");

    if (label) {
        label.textContent = on ? "Choose your PIN" : "Your PIN";
    }

    if (confirmField) {
        confirmField.hidden = !on;
    }

    if (confirmInput && !on) {
        confirmInput.value = "";
    }

    if (button) {
        button.textContent = on ? "Set PIN and continue" : "Sign in";
    }

    if (note) {
        note.textContent = on
            ? "Pick 4 to 6 digits you will remember. You will use this on every scan."
            : "Ask your supervisor if your PIN is not working.";
    }
}

window.setEnrolmentMode = setEnrolmentMode;
window.needsEnrolment = needsEnrolment;

/*
   Choose a PIN for the first time, then sign in.

   The database function only fills a gap (pin_hash is null), so
   this cannot overwrite a colleague's PIN from a stale form.
*/
async function enrolEmployee(employeeId, pin) {

    const confirmInput = document.getElementById("signInPinConfirm");
    const pinInput = document.getElementById("signInPin");

    const confirmation = confirmInput ? confirmInput.value.trim() : "";

    if (!/^[0-9]{4,6}$/.test(pin)) {
        setSignInMessage("Choose a PIN of 4 to 6 digits.", "error");
        pinInput?.focus();
        return false;
    }

    /*
       A PIN cannot be read back once saved - it is a bcrypt hash -
       so the confirmation is the only thing standing between a typo
       and being locked out of your own name.
    */
    if (confirmation !== pin) {
        setSignInMessage("The two PINs do not match. Please try again.", "error");
        if (confirmInput) {
            confirmInput.value = "";
            confirmInput.focus();
        }
        return false;
    }

    const client = getSupabase();

    if (!client) {
        setSignInMessage("Cannot set a PIN without a connection.", "error");
        return false;
    }

    try {

        const { data, error } = await client.rpc("claim_employee_pin", {
            p_employee_id: employeeId,
            p_pin: pin
        });

        if (error) {
            throw new Error(error.message);
        }

        if (data !== true) {
            /*
               The database refused: a PIN was already set while
               this form was open, or the employee is inactive.
            */
            setSignInMessage(
                "This name already has a PIN. Enter it to sign in.",
                "error"
            );
            setEnrolmentMode(false);
            return false;
        }

        return true;

    } catch (error) {

        console.error("AGA: could not set PIN:", error);

        setSignInMessage("Could not save your PIN. Please try again.", "error");

        return false;
    }
}

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

    /*
       In enrolment mode the pin is being CHOSEN; the 4-6 digit rule
       is enforced inside enrolEmployee so the message can name the
       action ("Choose a PIN") rather than "your PIN is wrong".
    */
    const enrolling = document.getElementById("signInPinConfirmField")?.hidden === false;

    if (enrolling) {

        if (button) {
            button.disabled = true;
            button.textContent = "Saving...";
        }

        const saved = await enrolEmployee(employeeId, pin);

        if (!saved) {
            if (button) {
                button.disabled = false;
                button.textContent = "Set PIN and continue";
            }
            return;
        }

        pinInput.value = "";

        const confirmInput = document.getElementById("signInPinConfirm");
        if (confirmInput) {
            confirmInput.value = "";
        }

        /*
           Now sign in with the PIN just chosen, so the person is
           not asked to type it twice in a row.
        */
        await completeSignIn(employeeId, pin, button);

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

    await completeSignIn(employeeId, pin, button);
}

/*
   The shared tail of both paths: verify the PIN, save the session,
   and start the app.

   Shared deliberately, so a person who just enrolled lands in
   exactly the same state as one who signed in normally.
*/
async function completeSignIn(employeeId, pin, button) {

    const pinInput = document.getElementById("signInPin");

    try {

        const client = getSupabase();

        if (!client) {
            setSignInMessage("Cannot sign in without a connection.", "error");
            return;
        }

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
            if (pinInput) {
                pinInput.value = "";
                pinInput.focus();
            }
            return;
        }

        const employee = data[0];

        saveSession({
            employeeId: employee.id,
            name: employee.name,
            employeeNumber: employee.employee_number || "",
            signedInAt: new Date().toISOString()
        });

        if (pinInput) {
            pinInput.value = "";
        }

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

        select.addEventListener("change", async () => {

            /* Reveal the PIN box only once a name is chosen. */
            if (pinField) {
                pinField.hidden = !select.value;
            }

            if (!select.value) {
                setEnrolmentMode(false);
                return;
            }

            /*
               Ask the database whether this name has a PIN yet.
               Choosing a name with no PIN means first-time
               enrolment, and the form has to look different for it.
            */
            setSignInMessage("Checking...");

            const enrolling = await needsEnrolment(select.value);

            setEnrolmentMode(enrolling);

            setSignInMessage(
                enrolling
                    ? "First time here - choose a PIN you will remember."
                    : "Enter your PIN."
            );

            if (pinInput) {
                pinInput.focus();
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

    /*
       Enter in the confirmation box also submits, so choosing a
       PIN is not a keyboard-then-reach-for-the-mouse job with
       dirty hands.
    */
    const confirmInput = document.getElementById("signInPinConfirm");

    if (confirmInput) {

        confirmInput.addEventListener("keydown", event => {

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

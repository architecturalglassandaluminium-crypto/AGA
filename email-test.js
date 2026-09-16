/*
   AGA EMAIL DIAGNOSTICS
   ---------------------------------------------------------
   A standalone page for finding out why email is not sending.

   It loads ONLY the app's configuration and mailer code - never
   app.js, never the service worker. That is deliberate: if the app
   itself is broken, this page still runs, which is the whole point
   of a diagnostic.

   It is not linked from anywhere in the app and nothing depends on
   it. Deleting this file and email-test.js costs nothing.
*/
function loadScript(src) {
    return new Promise(function (resolve, reject) {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = function () {
            reject(new Error("Could not load " + src));
        };
        document.head.appendChild(script);
    });
}

function setText(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    }
}

/*
   Turn a status code into something a non-developer can act on.
   "422" on its own means nothing to whoever is trying to send a
   customer a quote, so each code carries its likely cause with it.
*/
function explainStatus(status) {

    const notes = {
        200: "Sent. Resend accepted the message. Check the inbox, and the spam folder.",
        400: "The message was malformed. This is a bug in the app, not in your settings.",
        401: "The function refused the caller. Its JWT verification may be ON when it " +
            "should be OFF.",
        404: "No function at that URL. The name in email.js does not match the one " +
            "deployed in Supabase.",
        405: "The function only accepts POST. Something called it the wrong way.",
        422: "The function reached Resend, but Resend rejected the message. This is " +
            "almost always FROM_EMAIL: it must be an email address on a domain " +
            "verified in Resend, not an API key.",
        500: "The function threw before it finished. Its secrets are usually missing, or " +
            "a secret holds the wrong kind of value. The Supabase function Logs tab " +
            "shows the exact error.",
        501: "Email is not configured: RESEND_API_KEY or FROM_EMAIL is not set.",
        502: "The function could not reach Resend, or Resend returned an error."
    };

    return notes[status] || "Unexpected status. Read the raw response below.";
}

async function runDiagnostics() {

    const button = document.getElementById("runButton");
    const to = document.getElementById("toAddress").value.trim();
    const lines = [];

    if (button) {
        button.disabled = true;
    }

    setText("result", "Working...");

    const endpoint = typeof EMAIL_ENDPOINT === "string" ? EMAIL_ENDPOINT : "";

    lines.push("Endpoint : " + (endpoint || "(none - email.js still has the placeholder ref)"));

    lines.push("Backend  : " + (typeof isBackendConfigured === "function"
        ? (isBackendConfigured() ? "configured" : "NOT configured - URL or key is blank")
        : "unknown"));

    lines.push("Origin   : " + window.location.origin);
    lines.push("");

    if (!to || !endpoint) {
        lines.push(to
            ? "Nothing to call - set SUPABASE_PROJECT_REF in email.js first."
            : "Enter an address to send a test message to.");
        setText("result", lines.join("\n"));
        if (button) { button.disabled = false; }
        return;
    }

    try {
        /*
           Fire twice on purpose. The first call exercises the exact
           path the app uses (postEmail, which returns only
           true/false). The second reads the status and body that
           postEmail deliberately throws away.
        */
        const sent = await postEmail({
            to: to,
            subject: "AGA email test",
            html: "<p>Test from the AGA email diagnostics page.</p>"
        });

        const response = await fetch(endpoint, {
            method: "POST",
            headers: emailAuthHeaders(),
            body: JSON.stringify({
                to: to,
                subject: "AGA email test",
                html: "<p>Diagnostic call.</p>"
            })
        });

        const raw = await response.text();

        lines.push("postEmail reported : " + (sent ? "SUCCESS" : "FAILURE"));
        lines.push("HTTP status        : " + response.status);
        lines.push("");
        lines.push("What that means:");
        lines.push("  " + explainStatus(response.status));

        if (raw) {
            lines.push("");
            lines.push("Raw response from the function:");
            lines.push("  " + raw.slice(0, 800));
        }

    } catch (error) {
        lines.push("The request did not complete: " + error.message);
        lines.push("");
        lines.push("A network error here usually means the function URL is wrong, or a");
        lines.push("browser extension is blocking the request. The browser console (F12)");
        lines.push("will name the exact cause.");
    }

    setText("result", lines.join("\n"));

    if (button) {
        button.disabled = false;
    }
}

/*
   Start-up.

   This file is loaded WITHOUT defer, so it runs as soon as it is
   parsed - which may be BEFORE or AFTER DOMContentLoaded depending
   on how the browser scheduled it. Waiting on DOMContentLoaded alone
   was the bug: if the event had already fired, the listener never
   ran, the config scripts were never loaded, and the page sat on
   "loading..." with no error at all.

   `init()` therefore handles both cases.
*/
async function init() {

    const button = document.getElementById("runButton");

    if (button) {
        button.addEventListener("click", runDiagnostics);
    }

    try {
        /* supabase-config.js first: email.js reads the key from it. */
        await loadScript("supabase-config.js");
        await loadScript("email.js");
    } catch (error) {
        setText("endpointPreview", "Could not load the app's config: " + error.message);
        return;
    }

    setText("endpointPreview",
        typeof EMAIL_ENDPOINT === "string" && EMAIL_ENDPOINT
            ? EMAIL_ENDPOINT
            : "(none configured)");
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    /* The DOM is already parsed - run now rather than never. */
    init();
}

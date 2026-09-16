/* =========================================================
   Supabase Edge Function: send-production-email
   ---------------------------------------------------------
   Sends the AGA notification emails: a production update to the
   customer, and/or an internal copy to the office.

   WHY THIS EXISTS ON A SERVER
   ---------------------------
   The app is hosted on GitHub Pages, which serves static files
   only - it cannot keep an SMTP password or a mail-provider API
   key, because anything in the page is readable by every visitor.
   So the page POSTs the message here, and this function holds the
   secret and talks to the provider.

   PROVIDER
   --------
   Resend (https://resend.com), called over plain HTTPS.

   SET THESE SECRETS (never in the client code, never in git):

     supabase secrets set RESEND_API_KEY=re_xxxxxxxx
     supabase secrets set AGA_MAIL_FROM="AGA Workshop <no-reply@agasouthafrica.co.za>"
     supabase secrets set AGA_ALLOWED_ORIGIN="https://architecturalglassandaluminium-crypto.github.io"

   Or set them in the dashboard:
     Project -> Edge Functions -> Secrets

   If RESEND_API_KEY or AGA_MAIL_FROM is missing the function
   answers 501 and says so, and the app carries on: a missing
   mailer must never block the workshop.

   WHAT IT ACCEPTS
   ---------------
   POST JSON:
     {
       "to":      "one@example.com" | ["a@x.com", "b@x.com"],
       "subject": "...",
       "html":    "...",
       "replyTo": "optional@example.com",
       "attachments": [
         { "filename": "project-worksheet.html", "content": "<base64>" }
       ]
     }

   Attachments are optional and are forwarded to Resend unchanged,
   so the project worksheet can ride along with the project email.
   Each one needs a filename and base64 content; anything malformed
   is dropped rather than failing the whole message, because a
   broken attachment must never stop the notification going out.

   It is deliberately small: it forwards a message it was handed
   and does not read or write any workshop data.
   ========================================================= */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/*
   CORS.

   The app is served from GitHub Pages and this function lives on
   a Supabase domain, so every call is cross-origin: without these
   headers the browser blocks the response and email silently
   fails. AGA_ALLOWED_ORIGIN pins it to the real site rather than
   answering "*", so another website cannot use this function as a
   free mail relay.
*/
const ALLOWED_ORIGIN =
    Deno.env.get("AGA_ALLOWED_ORIGIN") ||
    "https://architecturalglassandaluminium-crypto.github.io";

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
        "Access-Control-Max-Age": "86400"
    };
}

function json(status: number, payload: unknown) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders()
        }
    });
}

/* A single address or a list, cleaned to non-empty strings. */
function normaliseRecipients(value: unknown): string[] {
    const list = Array.isArray(value) ? value : [value];

    return list
        .map(item => String(item ?? "").trim())
        .filter(Boolean);
}

/*
   Clean the attachment list down to the shape Resend expects.

   An attachment without a filename or without content is useless,
   so it is skipped. The whole list is optional, and a bad entry
   never throws - losing an attachment is far better than losing
   the email.
*/
function normaliseAttachments(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map(item => {
            const entry = (item ?? {}) as Record<string, unknown>;

            return {
                filename: String(entry.filename ?? "").trim(),
                content: String(entry.content ?? "").trim()
            };
        })
        .filter(item => item.filename && item.content);
}

Deno.serve(async (request: Request) => {

    /*
       The browser sends a preflight OPTIONS before a cross-origin
       POST, and it must be answered with the CORS headers or the
       real request is never sent.
    */
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    /* Only POST carries a message to send. */
    if (request.method !== "POST") {
        return json(405, { success: false, message: "Use POST." });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY") || "";
    const from = Deno.env.get("AGA_MAIL_FROM") || "";

    if (!apiKey || !from) {
        /*
           501 Not Implemented: the app treats this as "no mailer
           yet" and continues. Workshop work is never blocked by an
           unconfigured email server.
        */
        return json(501, {
            success: false,
            message:
                "Email is not configured. Set RESEND_API_KEY and " +
                "AGA_MAIL_FROM as Supabase Edge Function secrets."
        });
    }

    let payload: Record<string, unknown>;

    try {
        payload = JSON.parse(await request.text() || "{}");
    } catch {
        return json(400, { success: false, message: "Body was not valid JSON." });
    }

    const to = normaliseRecipients(payload.to);
    const subject = String(payload.subject ?? "").trim();
    const html = String(payload.html ?? "").trim();
    const replyTo = String(payload.replyTo ?? "").trim();
    const attachments = normaliseAttachments(payload.attachments);

    if (!to.length) {
        return json(400, { success: false, message: "No recipient was supplied." });
    }

    if (!subject) {
        return json(400, { success: false, message: "No subject was supplied." });
    }

    if (!html) {
        return json(400, { success: false, message: "No message body was supplied." });
    }

    const body: Record<string, unknown> = {
        from,
        to,
        subject,
        html
    };

    if (replyTo) {
        body.reply_to = replyTo;
    }

    if (attachments.length) {
        body.attachments = attachments;
    }

    try {
        const response = await fetch(RESEND_ENDPOINT, {
            method: "POST",
            headers: {
                Authorization: "Bearer " + apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        const text = await response.text();

        let parsed: Record<string, any> = {};

        try {
            parsed = text ? JSON.parse(text) : {};
        } catch {
            /* Non-JSON reply from the provider - reported below. */
        }

        if (!response.ok) {
            return json(502, {
                success: false,
                message:
                    parsed.message ||
                    parsed.error?.message ||
                    ("The mail provider returned HTTP " + response.status + ".")
            });
        }

        return json(200, {
            success: true,
            id: parsed.id || null,
            message: "Email sent."
        });

    } catch (error) {
        return json(502, {
            success: false,
            message: "Could not reach the mail provider: " +
                (error instanceof Error ? error.message : String(error))
        });
    }
});

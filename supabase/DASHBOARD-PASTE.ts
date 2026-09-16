// =========================================================
//  AGA - COPY THIS WHOLE FILE INTO THE SUPABASE DASHBOARD
//  ---------------------------------------------------------
//  For "Supabase web" setup: Edge Functions -> Deploy a new
//  function -> name it exactly:
//
//      send-production-email
//
//  then replace the template code with everything below and press
//  Deploy.
//
//  The deployed URL will be:
//
//    https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-production-email
//
//  Copy that URL into SUPABASE_PROJECT_REF in email.js.
//
//  SECRETS - set these in the dashboard FIRST:
//    Project Settings -> Edge Functions -> Secrets (Add new secret)
//
//      RESEND_API_KEY        re_your_key_here
//      AGA_MAIL_FROM         AGA Workshop <no-reply@agasouthafrica.co.za>
//      AGA_ALLOWED_ORIGIN    https://architecturalglassandaluminium-crypto.github.io
//
//  Until RESEND_API_KEY and AGA_MAIL_FROM are set, this function
//  answers 501 and the app falls back to opening a mail app. That is
//  deliberate: a missing mailer must never block the workshop.
// =========================================================

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/*
   CORS.

   The app is served from GitHub Pages and this function lives on a
   Supabase domain, so every call is cross-origin: without these
   headers the browser blocks the response and email silently fails.
   AGA_ALLOWED_ORIGIN pins it to the real site rather than answering
   "*", so another website cannot use this function as a free mail
   relay.
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

   An attachment without a filename or without content is useless, so
   it is skipped. The whole list is optional, and a bad entry never
   throws - losing an attachment is far better than losing the email.
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
       POST, and it must be answered with the CORS headers or the real
       request is never sent.
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
           501 Not Implemented: the app treats this as "no mailer yet"
           and continues.
        */
        return json(501, {
            success: false,
            message:
                "Email is not configured. Set RESEND_API_KEY and " +
                "AGA_MAIL_FROM as Supabase Edge Function secrets."
        });
    }

    let payload: Record<string, any>;

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

    const body: Record<string, unknown> = { from, to, subject, html };

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

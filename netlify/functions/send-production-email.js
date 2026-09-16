/*
   Netlify function: send-production-email
   Reachable at /.netlify/functions/send-production-email, rewritten
   from /api/send-production-email by netlify.toml.

   Sends the AGA notification emails: a production update to the
   customer, and/or an internal copy to the office.

   WHY THIS EXISTS ON THE SERVER
   -----------------------------
   A browser cannot hold an SMTP password or a mail-provider API
   key - anything in the page is readable by every visitor. So the
   page POSTs the message here, and this function holds the secret
   (read from the environment) and talks to the provider.

   PROVIDER
   --------
   Resend (https://resend.com), called over plain HTTPS so the
   function needs no npm dependencies - the same reason the rest of
   this project avoids a build step.

   Set these in the Netlify dashboard (Site settings -> Environment
   variables) - NEVER in the client code:

     RESEND_API_KEY   the API key, e.g. re_xxxxxxxx
     AGA_MAIL_FROM    verified sender, e.g.
                      "AGA Workshop <no-reply@agasouthafrica.co.za>"

   If they are not set the function answers 501 and says so, and the
   app carries on: a missing mailer must never block the workshop.

   WHAT IT ACCEPTS
   ---------------
   POST JSON:
     {
       "to":      "one@example.com" | ["a@x.com", "b@x.com"],
       "subject": "…",
       "html":    "…",
       "replyTo": "optional@example.com",
       "attachments": [
         { "filename": "project-worksheet.html", "content": "<base64>" }
       ]
     }

   Attachments are optional and are forwarded to Resend unchanged, so
   the project worksheet can ride along with the project email. Each
   one needs a filename and base64 content; anything malformed is
   dropped rather than failing the whole message, because a broken
   attachment must never stop the notification being sent.

   It is deliberately small: it forwards a message it was handed
   and does not read or write any workshop data.
*/

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/* A single address or a list, cleaned to non-empty strings. */
function normaliseRecipients(value) {
    const list = Array.isArray(value) ? value : [value];

    return list
        .map(item => String(item || "").trim())
        .filter(Boolean);
}

/*
   Clean the attachment list down to the shape Resend expects.

   An attachment without a filename or without content is useless, so
   it is skipped. The whole list is optional, and a bad entry never
   throws - losing an attachment is far better than losing the email.
*/
function normaliseAttachments(value) {

    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map(item => ({
            filename: String(item?.filename || "").trim(),
            content: String(item?.content || "").trim()
        }))
        .filter(item => item.filename && item.content)
        .map(item => ({
            filename: item.filename,
            content: item.content
        }));
}

function json(statusCode, payload) {
    return {
        statusCode,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload)
    };
}

exports.handler = async (event) => {

    /* Only POST carries a message to send. */
    if (event.httpMethod !== "POST") {
        return json(405, { success: false, message: "Use POST." });
    }

    const apiKey = process.env.RESEND_API_KEY || "";
    const from = process.env.AGA_MAIL_FROM || "";

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
                "AGA_MAIL_FROM in the Netlify environment variables."
        });
    }

    let payload;

    try {
        payload = JSON.parse(event.body || "{}");
    } catch (error) {
        return json(400, { success: false, message: "Body was not valid JSON." });
    }

    const to = normaliseRecipients(payload.to);
    const subject = String(payload.subject || "").trim();
    const html = String(payload.html || "").trim();
    const replyTo = String(payload.replyTo || "").trim();
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

    const body = {
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

        let parsed = {};

        try {
            parsed = text ? JSON.parse(text) : {};
        } catch (error) {
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
            message: "Could not reach the mail provider: " + error.message
        });
    }
};

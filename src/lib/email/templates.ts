import type { Notification } from "@/lib/types";

/**
 * Static email templates (PRD FR-9): no AI text ever goes into an email, user
 * content is escaped, and there is always a plain-text alternative.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderNotificationEmail(params: {
  notification: Pick<Notification, "title" | "body" | "link">;
  recipientName: string;
  campusName: string;
  appOrigin: string;
}): EmailContent {
  const { notification, recipientName, campusName, appOrigin } = params;
  const link = notification.link ? `${appOrigin}${notification.link}` : appOrigin;
  const title = escapeHtml(notification.title);
  const body = escapeHtml(notification.body);
  const name = escapeHtml(recipientName);
  const campus = escapeHtml(campusName);

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#DDD0C8;color:#323232;font-family:Inter,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#F3EEEA;border:1px solid #BFB1A7;border-radius:10px;">
      <tr>
        <td style="padding:20px 24px;border-bottom:1px solid #BFB1A7;">
          <strong style="font-size:16px;letter-spacing:0.08em;">LABLINK</strong>
          <div style="font-size:12px;color:#4A4A4A;margin-top:4px;">${campus}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 12px;font-size:16px;">Hi ${name},</p>
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${title}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">${body}</p>
          <p style="margin:0 0 24px;">
            <a href="${escapeHtml(link)}" style="display:inline-block;background:#323232;color:#F3EEEA;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:15px;">Open LabLink</a>
          </p>
          <p style="margin:0;font-size:12px;color:#4A4A4A;">You can turn off email updates in your profile; in-app notifications stay on.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;border-top:1px solid #BFB1A7;font-size:12px;color:#4A4A4A;">
          LabLink &middot; Every lab, within reach.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `LabLink - ${campus}`,
    "",
    `Hi ${recipientName},`,
    "",
    notification.title,
    notification.body,
    "",
    `Open LabLink: ${link}`,
    "",
    "You can turn off email updates in your profile; in-app notifications stay on.",
  ].join("\n");

  return { subject: `${notification.title} - LabLink`, html, text };
}

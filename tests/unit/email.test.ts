import { describe, expect, it } from "vitest";
import { escapeHtml, renderNotificationEmail } from "@/lib/email/templates";

describe("email templates", () => {
  const base = {
    notification: {
      title: 'Request <script>alert("x")</script> approved',
      body: "Your request for <b>Jetson</b> was approved.",
      link: "/requests/1",
    },
    recipientName: "Aarav & Priya",
    campusName: "Demo Campus",
    appOrigin: "https://lablink.example",
  };

  it("escapes user content in HTML and keeps a plain-text version", () => {
    const email = renderNotificationEmail(base);
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Aarav &amp; Priya");
    expect(email.text).toContain('Request <script>alert("x")</script> approved');
    expect(email.subject).toContain("LabLink");
  });

  it("uses a single clear action link with the app origin", () => {
    const email = renderNotificationEmail(base);
    expect(email.html).toContain("https://lablink.example/requests/1");
    expect(email.text).toContain("https://lablink.example/requests/1");
  });

  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { resetStoreForTests, type Store } from "@/lib/db/store";
import { flushEmails, setEmailProviderForTests } from "@/lib/email";
import type { EmailProvider } from "@/lib/email/provider";
import { notify, updateEmailPreference } from "@/lib/repo/notifications";

const BASE = new Date("2026-03-02T04:00:00.000Z");
const DEMO = "campus-demo";
const RIVERSIDE = "campus-riverside";

class RecordingProvider implements EmailProvider {
  readonly name = "recording";
  readonly sent: string[] = [];
  async send(message: { to: string }): Promise<{ id: string }> {
    this.sent.push(message.to);
    return { id: `test-${this.sent.length}` };
  }
}

let store: Store;

beforeEach(() => {
  store = resetStoreForTests(BASE);
  setEmailProviderForTests(new RecordingProvider());
});

describe("email outbox", () => {
  it("marks demo-campus mail skipped (demo) and never sends it", async () => {
    const provider = new RecordingProvider();
    setEmailProviderForTests(provider);

    notify(store, {
      campusId: DEMO,
      userId: "user-aarav",
      type: "request_decided",
      title: "Approved",
      body: "Your request was approved.",
      link: "/requests/1",
      email: true,
    });

    await flushEmails(store);

    const entry = store.data.emailOutbox[0]!;
    expect(entry.status).toBe("skipped");
    expect(entry.error).toBe("skipped (demo)");
    expect(provider.sent).toHaveLength(0);
  });

  it("sends for a real campus and records the provider message id", async () => {
    const provider = new RecordingProvider();
    setEmailProviderForTests(provider);

    notify(store, {
      campusId: RIVERSIDE,
      userId: "user-kiran",
      type: "request_decided",
      title: "Approved",
      body: "Your request was approved.",
      link: "/requests/1",
      email: true,
    });

    const sent = await flushEmails(store);
    expect(sent).toBe(1);
    expect(provider.sent).toEqual(["kiran@riverside.edu.in"]);

    const entry = store.data.emailOutbox[0]!;
    expect(entry.status).toBe("sent");
    expect(entry.providerMessageId).toMatch(/^test-/);
    expect(entry.sentAt).not.toBeNull();
  });

  it("respects the per-user email opt-out while keeping in-app notifications", async () => {
    const provider = new RecordingProvider();
    setEmailProviderForTests(provider);
    updateEmailPreference(store, "user-kiran", false);

    const notification = notify(store, {
      campusId: RIVERSIDE,
      userId: "user-kiran",
      type: "request_decided",
      title: "Approved",
      body: "Your request was approved.",
      email: true,
    });

    await flushEmails(store);

    const entry = store.data.emailOutbox[0]!;
    expect(entry.status).toBe("skipped");
    expect(entry.error).toMatch(/opted out/);
    expect(provider.sent).toHaveLength(0);
    expect(store.data.notifications.some((item) => item.id === notification.id)).toBe(true);
  });

  it("records provider failure without undoing the notification", async () => {
    setEmailProviderForTests({
      name: "failing",
      async send() {
        throw new Error("provider unavailable");
      },
    });

    notify(store, {
      campusId: RIVERSIDE,
      userId: "user-kiran",
      type: "request_decided",
      title: "Approved",
      body: "Your request was approved.",
      email: true,
    });

    await flushEmails(store);
    const entry = store.data.emailOutbox[0]!;
    expect(entry.status).toBe("failed");
    expect(entry.error).toMatch(/provider unavailable/);
    // The notification itself is untouched by the provider failure.
    expect(store.data.notifications).toHaveLength(4);
    expect(store.data.notifications.some((item) => item.type === "request_decided")).toBe(true);
  });
});

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string }>;
}

/** Default provider: writes the rendered email to the server log only. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";

  constructor(private readonly from: string) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    console.info(
      `[email:${this.name}] from=${this.from} to=${message.to} subject=${JSON.stringify(message.subject)}`,
    );
    return { id: `console-${Date.now().toString(36)}` };
  }
}

/** Resend-compatible HTTP provider; enabled only when EMAIL_API_KEY is set. */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      throw new Error(`Email provider returned ${response.status}`);
    }
    const payload = (await response.json()) as { id?: string };
    return { id: payload.id ?? `resend-${Date.now().toString(36)}` };
  }
}

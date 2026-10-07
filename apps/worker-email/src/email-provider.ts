export interface OutgoingEmail {
  to: string;
  from: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(email: OutgoingEmail): Promise<void>;
}

/**
 * Logs the email instead of sending it. This is the only provider wired up in
 * local/dev/test environments — swapping in a real provider (SES, Postgres, Resend,
 * etc.) later is a one-file change behind this interface, per docs/architecture/overview.md.
 */
export class ConsoleEmailProvider implements EmailProvider {
  async send(email: OutgoingEmail): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      [
        "\n--- EMAIL (console provider) ---",
        `From: ${email.from}`,
        `To: ${email.to}`,
        `Subject: ${email.subject}`,
        "",
        email.text,
        "--- END EMAIL ---\n"
      ].join("\n")
    );
  }
}

/** Real delivery via Resend's REST API - https://resend.com/docs/api-reference/emails/send-email */
export class ResendEmailProvider implements EmailProvider {
  constructor(private readonly apiKey: string) {}

  async send(email: OutgoingEmail): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        text: email.text
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend API error ${response.status}: ${body}`);
    }
  }
}

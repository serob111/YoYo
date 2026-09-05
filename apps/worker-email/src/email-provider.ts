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

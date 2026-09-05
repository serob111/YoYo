import type { EmailJobData } from "@yoyo/queue";

export function renderEmail(job: EmailJobData, webAppUrl: string): { subject: string; text: string } {
  switch (job.template) {
    case "MAGIC_LINK":
      return {
        subject: "Your login link",
        text: `Hi ${job.data.name ?? ""},\n\nClick to log in: ${webAppUrl}/auth/magic-link?token=${job.data.tokenId}\n\nThis link expires soon and can only be used once.`
      };
    case "ORGANIZATION_INVITE":
      return {
        subject: `You've been invited to join ${job.data.organizationName ?? "an organization"}`,
        text: `You've been invited to join ${job.data.organizationName}.\n\nAccept your invite: ${webAppUrl}/invite/accept?token=${job.data.tokenId}`
      };
    case "PASSWORD_RESET":
      return {
        subject: "Reset your password",
        text: `Hi ${job.data.name ?? ""},\n\nReset your password: ${webAppUrl}/auth/reset-password?token=${job.data.tokenId}\n\nIf you didn't request this, you can ignore this email.`
      };
    case "EMAIL_VERIFICATION":
      return {
        subject: "Verify your email address",
        text: `Hi ${job.data.name ?? ""},\n\nVerify your email: ${webAppUrl}/auth/verify-email?token=${job.data.tokenId}`
      };
    default: {
      const exhaustiveCheck: never = job.template;
      throw new Error(`Unknown email template: ${exhaustiveCheck}`);
    }
  }
}

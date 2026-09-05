import { Injectable } from "@nestjs/common";
import type { SignupInput, LoginInput } from "@yoyo/contracts";
import { PrismaService } from "../common/prisma.service";
import { ConflictDomainError, InvalidCredentialsError } from "../common/domain-errors";
import { EmailQueueService } from "../notifications/email-queue.service";
import { PasswordService } from "./password.service";
import { SessionService } from "./session.service";
import { AuthTokenService } from "./auth-token.service";

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: AuthTokenService,
    private readonly emailQueue: EmailQueueService
  ) {}

  async signup(input: SignupInput, meta: RequestMeta) {
    const existing = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new ConflictDomainError("An account with this email already exists.");
    }
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.prisma.client.user.create({
      data: { email: input.email, name: input.name, passwordHash }
    });

    const { rawToken } = await this.tokens.issue({ userId: user.id, purpose: "EMAIL_VERIFICATION" });
    await this.emailQueue.send({
      template: "EMAIL_VERIFICATION",
      to: user.email,
      data: { tokenId: rawToken, name: user.name }
    });

    const { rawToken: sessionToken } = await this.sessions.createSession(user.id, meta);
    return { user, rawSessionToken: sessionToken };
  }

  async login(input: LoginInput, meta: RequestMeta) {
    const user = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (!user || !user.passwordHash) {
      // Still run a hash verification against a dummy hash so the response timing
      // doesn't reveal whether the email exists.
      await this.passwords.verify("$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$AAAAAAAAAAAAAAAAAAAAAA", input.password);
      throw new InvalidCredentialsError();
    }
    const valid = await this.passwords.verify(user.passwordHash, input.password);
    if (!valid) {
      throw new InvalidCredentialsError();
    }
    const { rawToken: sessionToken } = await this.sessions.createSession(user.id, meta);
    return { user, rawSessionToken: sessionToken };
  }

  async logout(rawSessionToken: string): Promise<void> {
    await this.sessions.revokeSession(rawSessionToken);
  }

  async requestMagicLink(email: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) {
      // Do not reveal whether the account exists.
      return;
    }
    const { rawToken } = await this.tokens.issue({ userId: user.id, purpose: "LOGIN" });
    await this.emailQueue.send({
      template: "MAGIC_LINK",
      to: user.email,
      data: { tokenId: rawToken, name: user.name }
    });
  }

  async consumeMagicLink(rawToken: string, meta: RequestMeta) {
    const token = await this.tokens.consume(rawToken, "LOGIN");
    const { rawToken: sessionToken } = await this.sessions.createSession(token.userId, meta);
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: token.userId } });
    return { user, rawSessionToken: sessionToken };
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) {
      return;
    }
    const { rawToken } = await this.tokens.issue({ userId: user.id, purpose: "PASSWORD_RESET" });
    await this.emailQueue.send({
      template: "PASSWORD_RESET",
      to: user.email,
      data: { tokenId: rawToken, name: user.name }
    });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const token = await this.tokens.consume(rawToken, "PASSWORD_RESET");
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.client.user.update({ where: { id: token.userId }, data: { passwordHash } });
    // Force re-authentication everywhere after a password reset.
    await this.sessions.revokeAllSessionsForUser(token.userId);
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const token = await this.tokens.consume(rawToken, "EMAIL_VERIFICATION");
    await this.prisma.client.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } });
  }
}

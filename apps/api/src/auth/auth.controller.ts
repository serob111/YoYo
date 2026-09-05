import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import {
  consumeMagicLinkSchema,
  loginSchema,
  requestMagicLinkSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  signupSchema,
  type ConsumeMagicLinkInput,
  type LoginInput,
  type RequestMagicLinkInput,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type SignupInput
} from "@yoyo/contracts";
import type { ApiEnv } from "@yoyo/config";
import { API_ENV } from "../common/env.tokens";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { setCsrfCookie, setSessionCookie, clearSessionCookie } from "./cookies.util";
import { AuthRateLimitGuard } from "../common/auth-rate-limit.guard";

@Controller("auth")
@UseGuards(AuthRateLimitGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(API_ENV) private readonly env: ApiEnv
  ) {}

  @Post("signup")
  async signup(@Body(new ZodValidationPipe(signupSchema)) body: SignupInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, rawSessionToken } = await this.auth.signup(body, { ipAddress: req.ip, userAgent: req.headers["user-agent"] });
    setSessionCookie(res, this.env, rawSessionToken);
    setCsrfCookie(res, this.env);
    return { id: user.id, email: user.email, name: user.name };
  }

  @Post("login")
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, rawSessionToken } = await this.auth.login(body, { ipAddress: req.ip, userAgent: req.headers["user-agent"] });
    setSessionCookie(res, this.env, rawSessionToken);
    setCsrfCookie(res, this.env);
    return { id: user.id, email: user.email, name: user.name };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[this.env.SESSION_COOKIE_NAME];
    if (rawToken) {
      await this.auth.logout(rawToken);
    }
    clearSessionCookie(res, this.env);
  }

  @Post("magic-link/request")
  @HttpCode(202)
  async requestMagicLink(@Body(new ZodValidationPipe(requestMagicLinkSchema)) body: RequestMagicLinkInput) {
    await this.auth.requestMagicLink(body.email);
    return { message: "If an account exists for this email, a login link has been sent." };
  }

  @Post("magic-link/consume")
  @HttpCode(200)
  async consumeMagicLink(@Body(new ZodValidationPipe(consumeMagicLinkSchema)) body: ConsumeMagicLinkInput, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { user, rawSessionToken } = await this.auth.consumeMagicLink(body.token, { ipAddress: req.ip, userAgent: req.headers["user-agent"] });
    setSessionCookie(res, this.env, rawSessionToken);
    setCsrfCookie(res, this.env);
    return { id: user.id, email: user.email, name: user.name };
  }

  @Post("password-reset/request")
  @HttpCode(202)
  async requestPasswordReset(@Body(new ZodValidationPipe(requestPasswordResetSchema)) body: RequestPasswordResetInput) {
    await this.auth.requestPasswordReset(body.email);
    return { message: "If an account exists for this email, a password reset link has been sent." };
  }

  @Post("password-reset/confirm")
  @HttpCode(200)
  async resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    await this.auth.resetPassword(body.token, body.newPassword);
    return { message: "Password updated. Please log in again." };
  }
}

import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { ApiEnv } from "@yoyo/config";
import type { Request } from "express";
import { API_ENV } from "../common/env.tokens";
import { RequestContext } from "../common/request-context";
import { SessionRequiredError } from "../common/domain-errors";
import { SessionService } from "./session.service";

declare module "express-serve-static-core" {
  interface Request {
    currentUser?: { id: string; email: string; name: string };
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    @Inject(API_ENV) private readonly env: ApiEnv
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawToken = request.cookies?.[this.env.SESSION_COOKIE_NAME];
    if (!rawToken) {
      throw new SessionRequiredError();
    }
    const session = await this.sessions.resolveSession(rawToken);
    if (!session) {
      throw new SessionRequiredError();
    }
    request.currentUser = { id: session.user.id, email: session.user.email, name: session.user.name };
    const store = RequestContext.current();
    if (store) {
      store.userId = session.user.id;
    }
    return true;
  }
}

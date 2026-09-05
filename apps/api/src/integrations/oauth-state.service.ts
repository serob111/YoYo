import { Inject, Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApiEnv } from "@yoyo/config";
import { API_ENV } from "../common/env.tokens";

export interface OAuthStatePayload {
  organizationId: string;
  userId: string;
  issuedAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes - long enough for the Meta consent dialog, short enough to limit replay

/**
 * Signs OAuth `state` so the callback can trust which org/user initiated the
 * flow without a server-side session store, while rejecting tampering and
 * replay past the TTL. Not encryption - organizationId/userId in state aren't
 * secret, just need to be tamper-evident.
 */
@Injectable()
export class OAuthStateService {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  sign(payload: Omit<OAuthStatePayload, "issuedAt">): string {
    const full: OAuthStatePayload = { ...payload, issuedAt: Date.now() };
    const encoded = Buffer.from(JSON.stringify(full)).toString("base64url");
    const signature = this.hmac(encoded);
    return `${encoded}.${signature}`;
  }

  verify(state: string): OAuthStatePayload {
    const [encoded, signature] = state.split(".");
    if (!encoded || !signature) {
      throw new Error("Malformed OAuth state");
    }
    const expected = this.hmac(encoded);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error("OAuth state signature mismatch");
    }
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OAuthStatePayload;
    if (Date.now() - payload.issuedAt > STATE_TTL_MS) {
      throw new Error("OAuth state expired");
    }
    return payload;
  }

  private hmac(value: string): string {
    return createHmac("sha256", this.env.SESSION_COOKIE_SECRET).update(value).digest("base64url");
  }
}

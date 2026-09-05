import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { cookieHeader, parseSetCookies } from "./cookies";

export interface AuthedContext {
  userId: string;
  email: string;
  cookies: Record<string, string>;
  cookieHeader: string;
  csrfToken: string;
}

export async function signupUser(app: INestApplication, overrides: Partial<{ email: string; password: string; name: string }> = {}): Promise<AuthedContext> {
  const email = overrides.email ?? `user-${randomUUID()}@example.com`;
  const password = overrides.password ?? "correct-horse-battery-staple";
  const name = overrides.name ?? "Test User";

  const response = await request(app.getHttpServer()).post("/auth/signup").send({ email, password, name }).expect(201);

  const cookies = parseSetCookies(response.headers["set-cookie"] as unknown as string[]);
  return {
    userId: response.body.id,
    email,
    cookies,
    cookieHeader: cookieHeader(cookies),
    csrfToken: cookies["yoyo_csrf"]!
  };
}

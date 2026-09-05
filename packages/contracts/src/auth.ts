import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128),
  name: z.string().min(1).max(120)
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});
export type LoginInput = z.infer<typeof loginSchema>;

export const requestMagicLinkSchema = z.object({
  email: z.string().email()
});
export type RequestMagicLinkInput = z.infer<typeof requestMagicLinkSchema>;

export const consumeMagicLinkSchema = z.object({
  token: z.string().min(1)
});
export type ConsumeMagicLinkInput = z.infer<typeof consumeMagicLinkSchema>;

export const requestPasswordResetSchema = z.object({
  email: z.string().email()
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(10).max(128)
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const currentUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  emailVerifiedAt: z.string().datetime().nullable()
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

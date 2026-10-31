import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;

export const passwordSchema = z
  .string({ error: 'Enter a password' })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(200, 'Password is too long');

export const loginSchema = z.object({
  email: z.email('Enter a valid email address').transform((v) => v.toLowerCase()),
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password').max(200),
});

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address').transform((v) => v.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ error: 'Enter your current password' })
    .min(1, 'Enter your current password'),
  newPassword: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'OWNER';
}

export interface MeResponse {
  user: SessionUser;
  csrfToken: string;
}

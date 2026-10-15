import { z } from "zod";

export const APP_ROLES = [
  "admin",
  "project_manager",
  "finance",
  "member",
  "viewer",
] as const;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  fullName: z.string().min(2, "Enter your full name").max(120),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(12, "Password must be at least 12 characters").max(128),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const approveUserSchema = z.object({
  userId: z.uuid(),
  role: z.enum(APP_ROLES),
});
export type ApproveUserInput = z.infer<typeof approveUserSchema>;

/** Re-roling an already-active user (users-table inline role edit) -- same shape as
 * approveUserSchema, kept separate since approval and re-roling are different actions with
 * different side effects (approval also flips status + sends a notification). */
export const changeUserRoleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(APP_ROLES),
});
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleSchema>;

/** Every password the app sets (new account, reset, change). Mirrors Supabase auth config: 12+
 * chars with lowercase, uppercase and a digit. */
const newPassword = z
  .string()
  .min(12, "At least 12 characters")
  .max(128)
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/\d/, "Add a digit");

/** Admin creates an account directly (User access → Add user). */
export const createUserSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(APP_ROLES),
  sales: z.boolean(),
  password: newPassword,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** New password after following a reset email link. */
export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Signed-in user changing their own password (Settings). */
export const changePasswordSchema = z
  .object({ current: z.string().min(1, "Enter your current password"), password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" })
  .refine((v) => v.password !== v.current, { path: ["password"], message: "Choose a different password" });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

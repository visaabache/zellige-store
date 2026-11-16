"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPasswordOrDummy } from "@/lib/auth/password";
import { createSession, destroySession, getCurrentUser, isStaff, revokeOtherSessions } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
type FormState = { ok?: boolean; error?: string; redirect?: string } | null;
import type { ActionResult } from "@/lib/action-result";
import { audit } from "@/lib/audit";

/** Only same-site relative paths are accepted as a post-login destination. */
function safeNext(v: FormDataEntryValue | null, fallback: string) {
  const s = String(v || "");
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}

export async function adminLogin(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const ip = await clientIp();
  if (!rateLimit(`admin-login:${ip}`, 8, 900_000) || !rateLimit(`admin-login:${email}`, 6, 900_000)) return { error: "Too many attempts. Wait 15 minutes." };
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPasswordOrDummy(password, user?.passwordHash);
  if (!user || !ok || !user.isActive || !isStaff(user.role)) return { error: "Incorrect email or password." };
  await createSession(user);
  // Navigation happens on the client, so a failed request can be retried instead of crashing the page.
  return { ok: true, redirect: safeNext(form.get("next"), "/admin") };
}

export async function adminLogout() {
  await destroySession();
  redirect("/admin/login");
}

/** Admin: change your own password. Requires the current one; signs out your other sessions. */
export async function changeAdminPassword(fd: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) return { error: "Please sign in again." };
  const current = String(fd.get("current") || "");
  const next = String(fd.get("password") || "");
  const confirm = String(fd.get("confirm") || "");
  if (!rateLimit(`pw-change:${user.id}`, 8, 900_000)) return { error: "Too many attempts. Wait 15 minutes." };
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !(await verifyPasswordOrDummy(current, row.passwordHash))) return { error: "Your current password is incorrect." };
  if (next.length < 10 || next.length > 200) return { error: "The new password must be at least 10 characters." };
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return { error: "Use at least one letter and one digit." };
  if (next !== confirm) return { error: "The two new passwords do not match." };
  if (next === current) return { error: "Choose a password different from the current one." };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await revokeOtherSessions(user.id);
  await audit(user.email, "account.password_change", user.email);
  return { ok: true, message: "Password changed. Other devices have been signed out." };
}

/** Admin: update your own name. */
export async function updateAdminProfile(fd: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) return { error: "Please sign in again." };
  const name = String(fd.get("name") || "").trim().slice(0, 100);
  if (!name) return { error: "Enter your name." };
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  return { ok: true };
}

import { requireAdmin } from "@/lib/auth/session";
import { changeAdminPassword, updateAdminProfile } from "@/actions/account";
import { PageHeader } from "@/components/admin/AdminNav";
import { AdminForm, Badge, Card, Field, SubmitButton } from "@/components/admin/ui";

export const metadata = { title: "My account" };

export default async function AdminAccountPage() {
  const me = await requireAdmin();
  return (
    <>
      <PageHeader title="My account" description={me.email} actions={<Badge tone={me.role === "ADMIN" ? "blue" : "neutral"}>{me.role === "ADMIN" ? "owner" : "staff"}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Change password">
          <AdminForm action={changeAdminPassword} resetOnSuccess className="space-y-4">
            <Field label="Current password"><input name="current" type="password" required autoComplete="current-password" className="field" /></Field>
            <Field label="New password" hint="At least 10 characters, with a letter and a digit. A short sentence is easy to remember and hard to guess."><input name="password" type="password" required minLength={10} autoComplete="new-password" className="field" /></Field>
            <Field label="Confirm the new password"><input name="confirm" type="password" required minLength={10} autoComplete="new-password" className="field" /></Field>
            <SubmitButton>Change password</SubmitButton>
          </AdminForm>
          <p className="mt-4 text-xs text-charcoal-500">After a change, every other device signed in to this account is signed out. This browser stays signed in.</p>
        </Card>
        <Card title="Profile">
          <AdminForm action={updateAdminProfile} className="space-y-4">
            <Field label="Name"><input name="name" required defaultValue={me.name} className="field" /></Field>
            <Field label="Email" hint="Used to sign in. Another owner can change it in Settings → Team."><input value={me.email} disabled className="field bg-ivory-200" /></Field>
            <SubmitButton variant="outline">Save</SubmitButton>
          </AdminForm>
        </Card>
      </div>
    </>
  );
}

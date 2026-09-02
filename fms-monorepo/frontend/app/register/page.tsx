"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import RoleGuard from "@/components/RoleGuard";
import { apiFetch, type Role } from "@/lib/api";
import Button from "@/components/ui/Button";

type Branch = { id: string; name: string; code: string };
const roles: { value: Role; label: string; needsBranch: boolean }[] = [
  { value: "FINANCE_HEAD", label: "Finance Head", needsBranch: false },
  { value: "ACCOUNTS_HEAD", label: "Accounts Head", needsBranch: false },
  { value: "BRANCH_MANAGER", label: "Branch Manager", needsBranch: true },
  { value: "DATA_ENTRY_OPERATOR", label: "Data Entry Operator", needsBranch: true },
  { value: "PROGRAM_OFFICER", label: "Program Officer", needsBranch: true },
  { value: "AUDITOR", label: "Auditor", needsBranch: false },
];

export default function RegisterPage() {
  return <RoleGuard allowedRole="FINANCE_HEAD"><RegisterForm /></RoleGuard>;
}

function RegisterForm() {
  const [branches, setBranches] = useState<Branch[]>([]); const [role, setRole] = useState<Role>("BRANCH_MANAGER");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const needsBranch = roles.find((item) => item.value === role)?.needsBranch;
  useEffect(() => { apiFetch<Branch[]>("/api/branches").then(setBranches).catch((error) => setMessage({ type: "error", text: error.message })); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(null); const form = event.currentTarget; const data = new FormData(form);
    try {
      await apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ name: data.get("name"), email: data.get("email"), password: data.get("password"), role, branchId: needsBranch ? data.get("branchId") : null }) });
      form.reset(); setRole("BRANCH_MANAGER"); setMessage({ type: "success", text: "User account created successfully." });
    } catch (error) { setMessage({ type: "error", text: error instanceof Error ? error.message : "Registration failed" }); }
    finally { setBusy(false); }
  }
  return <main className="auth-page register-page"><section className="login-card register-card"><Link href="/finance-head" className="back-link">← Back to dashboard</Link><span className="eyebrow">USER MANAGEMENT</span><h1>Create account</h1><p>Add a new team member and assign their access.</p>{message && <div className={`inline-message ${message.type}`}>{message.text}</div>}<form onSubmit={submit}><div className="form-grid"><label>Full name<input name="name" placeholder="Full name" minLength={2} required /></label><label>Email address<input name="email" type="email" placeholder="name@fms.local" required /></label><label>Password<input name="password" type="password" minLength={8} placeholder="Minimum 8 characters" required /></label><label>Role<select name="role" value={role} onChange={(event) => setRole(event.target.value as Role)}>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{needsBranch && <label className="full-field">Branch<select name="branchId" required defaultValue=""><option value="" disabled>Select a branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</select></label>}</div><Button className="submit" disabled={busy}>{busy ? "Creating account…" : "Create user"}<span>→</span></Button></form></section></main>;
}

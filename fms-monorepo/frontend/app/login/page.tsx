"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";

const routes = { FINANCE_HEAD: "finance-head", ACCOUNTS_HEAD: "accounts-head", BRANCH_MANAGER: "branch-manager", DATA_ENTRY_OPERATOR: "data-entry", PROGRAM_OFFICER: "program-officer", AUDITOR: "auditor" } as const;

export default function LoginPage() {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username"));
    const password = String(form.get("password"));

    try {
      const user = await login(username, password);
      router.push(`/${routes[user.role]}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in"); setBusy(false);
    }
  }
  return <main className="auth-page"><div className="auth-glow"/><section className="login-card"><div className="brand login-brand"><span className="brand-mark">F</span><span><b>FMS</b><small>Finance management</small></span></div><span className="eyebrow">SECURE PORTAL</span><h1>Welcome back</h1><p>Sign in to manage your organization&apos;s finances.</p><form onSubmit={submit}><label>Username or email<input name="username" type="text" placeholder="admin" defaultValue="admin" required /></label><label>Password<input name="password" type="password" placeholder="Enter your password" defaultValue="admin" required /></label>{error && <div className="form-error">{error}</div>}<button className="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in to dashboard"}<span>→</span></button></form><small className="security">Demo login: admin / admin</small></section></main>;
}

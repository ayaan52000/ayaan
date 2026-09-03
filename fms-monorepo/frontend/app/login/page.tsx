"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import Button from "@/components/ui/Button";

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
  return <main className="auth-page"><div className="auth-glow"/><section className="login-card"><div className="brand login-brand"><span className="brand-mark">F</span><span><b>FMS</b><small>Finance management</small></span></div><span className="eyebrow">SECURE PORTAL</span><h1>Welcome back</h1><p>Sign in to manage your organization&apos;s finances.</p><form onSubmit={submit}><label>Email<input name="username" type="email" autoComplete="username" placeholder="name@example.com" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></label>{error && <div className="form-error">{error}</div>}<Button className="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in to dashboard"}<span>→</span></Button></form><small className="security">Use the account issued by your administrator.</small></section></main>;
}

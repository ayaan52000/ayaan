"use client";

import { useState } from "react";
import type { Role } from "@/lib/api";
import Button from "./ui/Button";

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";
const reports = [
  { path: "cash-advances.csv", label: "Cash advances", detail: "Requests, approvals and status" },
  { path: "expenses.csv", label: "Expenses", detail: "Categories, receipts and status" },
  { path: "ledger.csv", label: "Ledger", detail: "Transactions and running balances" },
];

export default function ReportsModule({ role }: { role: Role }) {
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  async function download(path: string) {
    setBusy(path); setError("");
    try {
      const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", `${to}T23:59:59.999Z`);
      const response = await fetch(`${API_URL}/api/reports/${path}?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Report failed");
      const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = path; anchor.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : "Download failed"); } finally { setBusy(""); }
  }
  const canDownloadPdf = ["FINANCE_HEAD", "ACCOUNTS_HEAD", "AUDITOR"].includes(role);
  return <section className="phase-module reports-module"><div className="module-heading"><div><span>CSV & PDF EXPORTS</span><h2>Reports center</h2><p>Download role-scoped finance data for analysis.</p></div><strong>{role.replaceAll("_", " ")}</strong></div>{error && <div className="inline-message error">{error}</div>}<div className="report-filters"><label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div><div className="report-grid">{reports.map((report) => <Button key={report.path} onClick={() => download(report.path)} disabled={Boolean(busy)}><i>CSV</i><span><b>{report.label}</b><small>{report.detail}</small></span><strong>{busy === report.path ? "…" : "↓"}</strong></Button>)}{canDownloadPdf && <Button onClick={() => download("branch-summary.pdf")} disabled={Boolean(busy)}><i>PDF</i><span><b>Branch summary</b><small>Balances and activity overview</small></span><strong>{busy === "branch-summary.pdf" ? "…" : "↓"}</strong></Button>}</div></section>;
}

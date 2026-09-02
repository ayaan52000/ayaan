"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, type Role, type SessionUser } from "@/lib/api";

type Summary = { id: string; name: string; code: string; currentBalance: string; lastActivityAt: string | null };
type Ledger = { branch: { name: string; code: string }; currentBalance: string; entries: { id: string; type: string; amount: string; runningBalance: string; description: string; createdAt: string; createdBy: { name: string } }[] };
const allowed: Role[] = ["FINANCE_HEAD", "ACCOUNTS_HEAD", "AUDITOR"];

export default function LedgerDashboard({ role, user }: { role: Role; user: SessionUser | null }) {
  const [summary, setSummary] = useState<Summary[]>([]); const [selected, setSelected] = useState(""); const [ledger, setLedger] = useState<Ledger | null>(null); const [error, setError] = useState("");
  const loadLedger = useCallback(async (branchId: string) => { setSelected(branchId); try { setLedger(await apiFetch<Ledger>(`/api/ledger/${branchId}`)); } catch (e) { setError(e instanceof Error ? e.message : "Could not load ledger"); } }, []);
  useEffect(() => { if (!user || !allowed.includes(role)) return; apiFetch<Summary[]>("/api/ledger/summary").then((data) => { setSummary(data); if (data[0]) loadLedger(data[0].id); }).catch((e) => setError(e.message)); }, [user, role, loadLedger]);
  if (!allowed.includes(role)) return null;
  return <section className="phase-module ledger-module"><div className="module-heading"><div><span>LIVE LEDGER</span><h2>Branch balances</h2><p>Current running balance and complete transaction history.</p></div></div>{error && <div className="inline-message error">{error}</div>}<div className="balance-grid">{summary.map((branch) => <button key={branch.id} className={selected === branch.id ? "selected" : ""} onClick={() => loadLedger(branch.id)}><small>{branch.name} · {branch.code}</small><strong>${Number(branch.currentBalance).toLocaleString()}</strong><span>{branch.lastActivityAt ? `Updated ${new Date(branch.lastActivityAt).toLocaleDateString()}` : "No activity"}</span></button>)}</div>{ledger && <div className="advance-table-wrap"><table className="advance-table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Created by</th><th>Amount</th><th>Running balance</th></tr></thead><tbody>{ledger.entries.length === 0 ? <tr><td colSpan={6} className="empty-row">No ledger activity for this branch.</td></tr> : ledger.entries.map((entry) => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleDateString()}</td><td><span className="status-pill disbursed">{entry.type}</span></td><td>{entry.description}</td><td>{entry.createdBy.name}</td><td className="amount-cell">${Number(entry.amount).toLocaleString()}</td><td className="amount-cell">${Number(entry.runningBalance).toLocaleString()}</td></tr>)}</tbody></table></div>}</section>;
}

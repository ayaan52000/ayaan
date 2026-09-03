"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, type Role, type SessionUser } from "@/lib/api";

type Branch = { id: string; name: string; code: string; isActive: boolean; createdAt?: string };
type Balance = { id: string; currentBalance: string; lastActivityAt: string | null };
const canViewBalances: Role[] = ["FINANCE_HEAD", "ACCOUNTS_HEAD", "AUDITOR"];

export default function BranchesModule({ role, user }: { role: Role; user: SessionUser | null }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    const requests: [Promise<Branch[]>, Promise<Balance[]>] = [
      apiFetch<Branch[]>("/api/branches"),
      canViewBalances.includes(role) ? apiFetch<Balance[]>("/api/ledger/summary") : Promise.resolve([]),
    ];
    Promise.all(requests)
      .then(([branchRows, balanceRows]) => { setBranches(branchRows); setBalances(balanceRows); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load branches"))
      .finally(() => setLoading(false));
  }, [role, user]);

  const balanceByBranch = useMemo(() => new Map(balances.map((item) => [item.id, item])), [balances]);

  return <section className="phase-module branches-module">
    <div className="module-heading"><div><span>BRANCH DIRECTORY</span><h2>Branches</h2><p>View active locations and their operational details.</p></div><strong>{branches.length} active</strong></div>
    {error && <div className="inline-message error">{error}</div>}
    {loading ? <p className="branch-loading">Loading branches…</p> : <div className="branch-directory">
      {branches.map((branch) => {
        const balance = balanceByBranch.get(branch.id);
        const assigned = user?.branchId === branch.id;
        return <article key={branch.id} className={assigned ? "assigned" : ""}>
          <div className="branch-card-head"><span>{branch.code.slice(0, 2).toUpperCase()}</span><i>Active</i></div>
          <h3>{branch.name}</h3><p>Branch code <b>{branch.code}</b></p>
          {assigned && <em>Your assigned branch</em>}
          {balance && <div className="branch-finance"><small>Current balance</small><strong>${Number(balance.currentBalance).toLocaleString()}</strong><time>{balance.lastActivityAt ? `Last activity ${new Date(balance.lastActivityAt).toLocaleDateString()}` : "No ledger activity"}</time></div>}
          <footer><small>Branch ID</small><code>{branch.id}</code></footer>
        </article>;
      })}
      {branches.length === 0 && !error && <p className="empty-row">No active branches found.</p>}
    </div>}
  </section>;
}

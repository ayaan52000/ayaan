"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Role, SessionUser } from "@/lib/api";
import { logout as clearSession } from "@/lib/api";
import CashAdvanceModule from "./CashAdvanceModule";
import ExpenseModule from "./ExpenseModule";
import LedgerDashboard from "./LedgerDashboard";
import BranchesModule from "./BranchesModule";
import ReportsModule from "./ReportsModule";
import AuditLogViewer from "./AuditLogViewer";
import NotificationBell from "./NotificationBell";
import ThemeSwitcher from "./ThemeSwitcher";
import Button from "./ui/Button";

const roleNames: Record<Role, string> = {
  FINANCE_HEAD: "Finance Head", ACCOUNTS_HEAD: "Accounts Head", BRANCH_MANAGER: "Branch Manager",
  DATA_ENTRY_OPERATOR: "Data Entry", PROGRAM_OFFICER: "Program Officer", AUDITOR: "Auditor",
};
const icons = { dashboard: "⌂", advances: "↗", expenses: "▤", approvals: "✓", ledger: "◇", branches: "⌘", reports: "▥" };
const chartData = [
  { month: "Jan", income: 74, expense: 42 }, { month: "Feb", income: 48, expense: 38 },
  { month: "Mar", income: 52, expense: 47 }, { month: "Apr", income: 70, expense: 51 },
  { month: "May", income: 58, expense: 49 }, { month: "Jun", income: 66, expense: 45 },
  { month: "Jul", income: 53, expense: 44 }, { month: "Aug", income: 82, expense: 57 },
  { month: "Sep", income: 68, expense: 52 }, { month: "Oct", income: 88, expense: 60 },
];

export type DashboardView = "overview" | "cash-advances" | "expenses" | "approvals" | "ledger" | "branches" | "reports" | "audit";
const rolePaths: Record<Role, string> = {
  FINANCE_HEAD: "finance-head", ACCOUNTS_HEAD: "accounts-head", BRANCH_MANAGER: "branch-manager",
  DATA_ENTRY_OPERATOR: "data-entry", PROGRAM_OFFICER: "program-officer", AUDITOR: "auditor",
};

export default function Dashboard({ role, view = "overview" }: { role: Role; view?: DashboardView }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => { const value = localStorage.getItem("user"); if (value) setUser(JSON.parse(value)); }, []);

  async function logout() { await clearSession(); window.location.href = "/login"; }
  const basePath = `/${rolePaths[role]}`;

  return <main className="dashboard-page">
    <div className="aurora aurora-one" /><div className="aurora aurora-two" />
    <section className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">F</span><span><b>FMS</b><small>Finance management</small></span></div>
        <nav>
          <Link className={view === "overview" ? "active" : ""} href={basePath}><span>{icons.dashboard}</span>Overview</Link>
          <Link className={view === "cash-advances" ? "active" : ""} href={`${basePath}/cash-advances`}><span>{icons.advances}</span>Cash advances</Link><Link className={view === "expenses" ? "active" : ""} href={`${basePath}/expenses`}><span>{icons.expenses}</span>Expenses</Link>
          <Link className={view === "approvals" ? "active" : ""} href={`${basePath}/approvals`}><span>{icons.approvals}</span>Approvals</Link><Link className={view === "ledger" ? "active" : ""} href={`${basePath}/ledger`}><span>{icons.ledger}</span>Ledger</Link>
          <p>MANAGEMENT</p><Link className={view === "branches" ? "active" : ""} href={`${basePath}/branches`}><span>{icons.branches}</span>Branches</Link><Link className={view === "reports" ? "active" : ""} href={`${basePath}/reports`}><span>{icons.reports}</span>Reports</Link>
          {(role === "AUDITOR" || role === "FINANCE_HEAD") && <Link className={view === "audit" ? "active" : ""} href={`${basePath}/audit`}><span>◎</span>Audit log</Link>}
          {role === "FINANCE_HEAD" && <a href="/register"><span>＋</span>Register user</a>}
        </nav>
        <div className="side-profile"><div className="avatar">{user?.name?.[0] ?? "U"}</div><div><b>{user?.name ?? roleNames[role]}</b><small>{roleNames[role]}</small></div><Button onClick={logout} title="Sign out">↪</Button></div>
      </aside>

      <div className="content">
        <header><div><small>FINANCE MANAGEMENT SYSTEM</small><h1>Good morning, {user?.name?.split(" ")[0] ?? roleNames[role]}</h1><p>Here&apos;s what&apos;s happening with your finances today.</p></div><div className="header-tools"><Button className="search">⌕ <span>Search anything…</span></Button><ThemeSwitcher/><NotificationBell user={user} /><div className="mini-avatar">{user?.name?.[0] ?? "U"}</div></div></header>

        {view === "overview" && <><div className="metrics">
          <Metric title="Available balance" value="$ 124,580" trend="+8.2%" icon="$" />
          <Metric title="Pending approvals" value="18" trend="5 urgent" icon="✓" warning />
          <Metric title="Monthly expenses" value="$ 42,890" trend="−3.4%" icon="▤" />
          <Metric title="Active branches" value="24" trend="All active" icon="⌘" />
        </div>

        <div className="grid-main">
          <section className="card chart-card"><CardTitle title="Cash flow overview" subtitle="Income and expenses across all branches" />
            <div className="legend"><span><i className="dot purple" />Income</span><span><i className="dot blue" />Expenses</span><select aria-label="Chart range"><option>Last 10 months</option></select></div>
            <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}><defs><linearGradient id="income" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".55"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient><linearGradient id="expense" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent-2)" stopOpacity=".25"/><stop offset="1" stopColor="var(--accent-2)" stopOpacity="0"/></linearGradient></defs><CartesianGrid stroke="var(--line)" vertical={false}/><XAxis dataKey="month" stroke="var(--muted)" tickLine={false} axisLine={false}/><YAxis stroke="var(--muted)" tickLine={false} axisLine={false}/><Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12 }}/><Area type="monotone" dataKey="income" stroke="var(--accent)" strokeWidth={3} fill="url(#income)" isAnimationActive animationDuration={800} animationEasing="ease-out"/><Area type="monotone" dataKey="expense" stroke="var(--accent-2)" strokeWidth={2} fill="url(#expense)" isAnimationActive animationDuration={800} animationEasing="ease-out"/></AreaChart></ResponsiveContainer></div>
          </section>

          <section className="card budget-card"><CardTitle title="Budget utilization" subtitle="Monthly spending limit" /><div className="ring"><div><strong>68%</strong><span>utilized</span></div></div><div className="budget-values"><span><small>Spent</small><b>$68,240</b></span><span><small>Remaining</small><b>$31,760</b></span></div><div className="progress"><i /></div><p>12 days remaining in this cycle</p></section>

          <section className="card approvals-card"><CardTitle title="Recent approvals" subtitle="Items waiting for your review" action="View all" /><div className="approval-list"><Approval initials="AK" name="Ahmed Khan" detail="Travel advance · Lahore" amount="$2,450" color="violet"/><Approval initials="SM" name="Sara Malik" detail="Office supplies · Karachi" amount="$1,280" color="cyan"/><Approval initials="UR" name="Usman Raza" detail="Field visit · Islamabad" amount="$3,120" color="orange"/></div></section>
          <section className="card activity-card"><CardTitle title="Branch activity" subtitle="Expenses by location" action="View report"/><Branch name="Karachi Central" value="$14,280" width="82%"/><Branch name="Lahore East" value="$11,940" width="67%"/><Branch name="Islamabad" value="$9,860" width="55%"/><Branch name="Peshawar" value="$6,810" width="38%"/></section>
        </div></>}
        {view === "cash-advances" && <CashAdvanceModule role={role} user={user} />}
        {(view === "expenses" || view === "approvals") && <ExpenseModule role={role} user={user} />}
        {view === "ledger" && <LedgerDashboard role={role} user={user} />}
        {view === "branches" && <BranchesModule role={role} user={user} />}
        {view === "reports" && <ReportsModule role={role} />}
        {view === "audit" && <AuditLogViewer role={role} user={user} />}
      </div>
    </section>
  </main>;
}

function Metric({ title, value, trend, icon, warning = false }: { title: string; value: string; trend: string; icon: string; warning?: boolean }) { return <section className="card metric"><div><small>{title}</small><strong>{value}</strong><span className={warning ? "warn" : ""}>{trend}</span></div><i>{icon}</i></section>; }
function CardTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: string }) { return <div className="card-title"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && <Button>{action} →</Button>}</div>; }
function Approval({ initials, name, detail, amount, color }: { initials: string; name: string; detail: string; amount: string; color: string }) { return <div className="approval"><span className={`person ${color}`}>{initials}</span><div><b>{name}</b><small>{detail}</small></div><strong>{amount}</strong><Button>Review</Button></div>; }
function Branch({ name, value, width }: { name: string; value: string; width: string }) { return <div className="branch"><div><span>{name}</span><b>{value}</b></div><div className="bar"><i style={{ width }} /></div></div>; }

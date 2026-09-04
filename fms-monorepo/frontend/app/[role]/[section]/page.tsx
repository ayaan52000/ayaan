import { notFound } from "next/navigation";
import Dashboard, { type DashboardView } from "@/components/Dashboard";
import RoleGuard from "@/components/RoleGuard";
import type { Role } from "@/lib/api";

const roles: Record<string, Role> = {
  "finance-head": "FINANCE_HEAD", "accounts-head": "ACCOUNTS_HEAD", "branch-manager": "BRANCH_MANAGER",
  "data-entry": "DATA_ENTRY_OPERATOR", "program-officer": "PROGRAM_OFFICER", auditor: "AUDITOR",
};
const sections = new Set<DashboardView>(["cash-advances", "expenses", "approvals", "ledger", "branches", "reports", "audit", "funds", "settings", "approval-rules"]);

export default function Page({ params }: { params: { role: string; section: string } }) {
  const role = roles[params.role];
  const section = params.section as DashboardView;
  if (!role || !sections.has(section) || (section === "audit" && role !== "AUDITOR" && role !== "FINANCE_HEAD") || (section === "funds" && !["FINANCE_HEAD", "ACCOUNTS_HEAD", "AUDITOR"].includes(role)) || (section === "approval-rules" && role !== "FINANCE_HEAD")) notFound();
  return <RoleGuard allowedRole={role}><Dashboard role={role} view={section} /></RoleGuard>;
}

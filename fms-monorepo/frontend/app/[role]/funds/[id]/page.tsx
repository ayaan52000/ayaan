import { notFound } from "next/navigation"; import FundDetail from "@/components/FundDetail"; import RoleGuard from "@/components/RoleGuard"; import type { Role } from "@/lib/api";
const roles:Record<string,Role>={"finance-head":"FINANCE_HEAD","accounts-head":"ACCOUNTS_HEAD",auditor:"AUDITOR"};
export default function Page({params}:{params:{role:string;id:string}}){const role=roles[params.role];if(!role)notFound();return <RoleGuard allowedRole={role}><main className="dashboard-page"><FundDetail id={params.id} role={role}/></main></RoleGuard>}

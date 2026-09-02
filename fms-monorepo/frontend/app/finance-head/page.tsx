import Dashboard from "@/components/Dashboard"; import RoleGuard from "@/components/RoleGuard";
export default function Page(){return <RoleGuard allowedRole="FINANCE_HEAD"><Dashboard role="FINANCE_HEAD"/></RoleGuard>}

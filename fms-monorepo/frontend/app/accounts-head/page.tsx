import Dashboard from "@/components/Dashboard"; import RoleGuard from "@/components/RoleGuard";
export default function Page(){return <RoleGuard allowedRole="ACCOUNTS_HEAD"><Dashboard role="ACCOUNTS_HEAD"/></RoleGuard>}

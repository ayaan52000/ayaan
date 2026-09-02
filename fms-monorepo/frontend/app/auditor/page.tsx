import Dashboard from "@/components/Dashboard"; import RoleGuard from "@/components/RoleGuard";
export default function Page(){return <RoleGuard allowedRole="AUDITOR"><Dashboard role="AUDITOR"/></RoleGuard>}

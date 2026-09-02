import Dashboard from "@/components/Dashboard"; import RoleGuard from "@/components/RoleGuard";
export default function Page(){return <RoleGuard allowedRole="BRANCH_MANAGER"><Dashboard role="BRANCH_MANAGER"/></RoleGuard>}

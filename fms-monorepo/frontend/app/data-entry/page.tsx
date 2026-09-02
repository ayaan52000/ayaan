import Dashboard from "@/components/Dashboard"; import RoleGuard from "@/components/RoleGuard";
export default function Page(){return <RoleGuard allowedRole="DATA_ENTRY_OPERATOR"><Dashboard role="DATA_ENTRY_OPERATOR"/></RoleGuard>}

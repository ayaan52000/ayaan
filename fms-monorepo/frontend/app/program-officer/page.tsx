import Dashboard from "@/components/Dashboard"; import RoleGuard from "@/components/RoleGuard";
export default function Page(){return <RoleGuard allowedRole="PROGRAM_OFFICER"><Dashboard role="PROGRAM_OFFICER"/></RoleGuard>}

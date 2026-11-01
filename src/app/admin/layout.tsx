import { redirect } from "next/navigation";
import { AdminShell } from "@/components/layout/admin-shell";
import { getClinicSettings } from "@/server/application/settings/clinic-settings";
import { getActor } from "@/server/authorization/actor";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.role === "patient") redirect("/patient/dashboard");

  const settings = await getClinicSettings(actor.supabase);

  return (
    <AdminShell
      user={{ fullName: actor.fullName, role: actor.role }}
      clinic={{ name: settings.clinicName, nameAr: settings.clinicNameAr, doctorName: settings.doctorName }}
    >
      {children}
    </AdminShell>
  );
}

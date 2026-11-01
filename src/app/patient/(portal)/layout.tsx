import { redirect } from "next/navigation";
import { getActor, getPendingPatient } from "@/server/authorization/actor";
import { PatientPortalShell } from "@/features/patients/components/patient-portal-shell";

export default async function PatientPortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) {
    redirect((await getPendingPatient()) ? "/patient/verify" : "/patient/login");
  }
  if (actor.role !== "patient") redirect("/admin/dashboard");
  return <PatientPortalShell fullName={actor.fullName}>{children}</PatientPortalShell>;
}

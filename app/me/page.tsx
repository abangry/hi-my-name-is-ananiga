import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MainDashboard } from "@/components/dashboard/main-dashboard";

function LoadingSpinner() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
}

async function DashboardData() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return <MainDashboard initialProfile={profile} initialView="friends" />;
}

export default function MePage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <DashboardData />
    </Suspense>
  );
}

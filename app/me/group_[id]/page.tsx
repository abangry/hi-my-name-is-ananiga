import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MainDashboard } from "@/components/dashboard/main-dashboard";

interface GroupChatPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function GroupChatPage({ params }: GroupChatPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Await params in Next.js 15
  const { id } = await params;

  return <MainDashboard initialProfile={profile} initialView="group-chat" groupChatId={id} />;
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MainDashboard } from "@/components/dashboard/main-dashboard";

interface DmPageProps {
  params: Promise<{
    user_tag: string;
  }>;
}

export default async function DmPage({ params }: DmPageProps) {
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
  const { user_tag } = await params;

  // Decode the URL-encoded tag (handles # character)
  const decodedTag = decodeURIComponent(user_tag);

  return <MainDashboard initialProfile={profile} initialView="dm" userTag={decodedTag} />;
}

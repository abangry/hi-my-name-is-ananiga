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

  // Next.js App Router doesn't support partial dynamic segments in folder names,
  // so group URLs like /me/group_abc123 fall through to this [user_tag] route.
  // Detect and handle them here.
  if (decodedTag.startsWith('group_')) {
    const groupId = decodedTag.replace('group_', '');
    const { data: groupData } = await supabase
      .from("group_chats")
      .select("id, name, icon_url")
      .eq("id", groupId)
      .single();
    return <MainDashboard initialProfile={profile} initialView="group-chat" groupChatId={groupId} initialGroupData={groupData} />;
  }

  // Pre-fetch DM user data server-side so the client renders the correct view immediately
  const { data: dmUser } = await supabase
    .from("profiles")
    .select("id, username, tag, display_name, avatar_url, profile_theme")
    .eq("tag", decodedTag)
    .single();

  return <MainDashboard initialProfile={profile} initialView="dm" userTag={decodedTag} initialDmUser={dmUser} />;
}

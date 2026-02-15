import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function MeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  return (
    <div className="min-h-screen h-screen w-full overflow-hidden bg-gray-50">
      {children}
    </div>
  );
}

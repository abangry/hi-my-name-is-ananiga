import { redirect } from "next/navigation";

// Platform is shut down — block all /me routes regardless of auth status
export default function MeLayout() {
  redirect("/");
}

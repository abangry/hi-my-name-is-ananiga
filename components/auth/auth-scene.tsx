"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthForm } from "./auth-form";

export function AuthScene() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<"login" | "signup">(initialMode);

  return <AuthForm mode={mode} onModeChange={setMode} />;
}

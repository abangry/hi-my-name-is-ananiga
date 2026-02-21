import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const SALT = process.env.GOODBYE_RATE_SALT ?? "change-me";
const DAILY_LIMIT = 3;
const MAX_LEN = 20;

function getClientIp(req: NextRequest) {
  // Vercel/Proxies commonly set x-forwarded-for
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();

  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();

  // NextRequest has ip sometimes depending on runtime
  // @ts-ignore
  return (req.ip as string | undefined) ?? "unknown";
}

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

export async function POST(req: NextRequest) {
  try {
    const { message } = (await req.json()) as { message?: string };

    const cleaned = (message ?? "").trim();

    if (!cleaned) {
      return NextResponse.json({ ok: false, error: "Message is empty." }, { status: 400 });
    }
    if (cleaned.length > MAX_LEN) {
      return NextResponse.json(
        { ok: false, error: `Max ${MAX_LEN} characters.` },
        { status: 400 }
      );
    }

    const ip = getClientIp(req);
    const ua = req.headers.get("user-agent") ?? "unknown";

    // Hash IP + UA together to reduce easy sharing of an IP pool
    const ip_hash = sha256(`${SALT}:${ip}:${ua}`);

    const supabase = createAdminClient();

    const dayStart = startOfUtcDay(new Date());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // Count today’s messages for this ip_hash, it's hashed no way for me to decode if you wonder (server-side enforcement)
    const { count, error: countError } = await supabase
      .from("goodbye_messages")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ip_hash)
      .gte("created_at", dayStart.toISOString())
      .lt("created_at", dayEnd.toISOString());

    if (countError) {
      return NextResponse.json({ ok: false, error: "Count failed." }, { status: 500 });
    }

    const used = count ?? 0;
    if (used >= DAILY_LIMIT) {
      return NextResponse.json(
        { ok: false, error: `Daily limit reached (${DAILY_LIMIT}/day). Come back tomorrow.` },
        { status: 429 }
      );
    }

    // Insert
    const { error: insertError } = await supabase.from("goodbye_messages").insert({
      message: cleaned,
      ip_hash,
    });

    if (insertError) {
      return NextResponse.json({ ok: false, error: "Insert failed." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      remaining: DAILY_LIMIT - (used + 1),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
}
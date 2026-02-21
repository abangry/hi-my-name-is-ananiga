

import { createAdminClient } from "@/lib/supabase/admin";
import NotePager from "@/components/NotePager";
import LeaveGoodbyeNote from "@/components/LeaveGoodbyeNote";

export const dynamic = "force-dynamic";

function compact(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(n);
}

function prettyDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function pickLast(...dates: Array<string | null | undefined>) {
  const parsed = dates
    .filter(Boolean)
    .map((x) => new Date(x as string).getTime())
    .filter((t) => Number.isFinite(t));
  if (!parsed.length) return null;
  return new Date(Math.max(...parsed)).toISOString();
}

function initialLetter(name?: string | null) {
  const s = (name || "U").trim();
  return (s[0] || "U").toUpperCase();
}

export default async function Home() {
  const supabase = createAdminClient();

const [
  profilesCount,
  groupsCount,
  dmMsgsCount,
  groupMsgsCount,
  firstUser,
  lastDmMsg,
  lastGroupMsg,
  users,
] = await Promise.all([
  supabase.from("profiles").select("*", { count: "exact", head: true }),
  supabase.from("group_chats").select("*", { count: "exact", head: true }),
  supabase.from("direct_messages").select("*", { count: "exact", head: true }),
  supabase.from("group_chat_messages").select("*", { count: "exact", head: true }),

  supabase
    .from("profiles")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle(),

  supabase
    .from("direct_messages")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle(),

  supabase
    .from("group_chat_messages")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle(),

  supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, banner_url, bio, created_at")
    .order("created_at", { ascending: true })
    .limit(30),
]);

const startedAt = firstUser.data?.created_at ?? null;
const lastActivityAt = pickLast(
  lastDmMsg.data?.created_at ?? null,
  lastGroupMsg.data?.created_at ?? null
);

const totals = [
  { label: "Users", value: profilesCount.count ?? 0 },
  { label: "Groups", value: groupsCount.count ?? 0 },
  { label: "DM messages", value: dmMsgsCount.count ?? 0 },
  { label: "Group messages", value: groupMsgsCount.count ?? 0 },
];

const notePages = [
`If you're reading this, it means the platform is gone.

Not crashed. Not broken.

Just... closed.

I know this probably feels sudden, but what you've been using until now wasn't your platform. It was mine, temporarily. Giving "more" time simply wouldn't change anyone's ambition. What happens next is up to you.`,

`And yeah, this is the surprise I mentioned to you about Miss May.

But unfortunately for you, Chaos, it's pretty much impossible for me to keep helping you with the platform this weekend. And I don't think I'd have the time to build this "goodbye page" later either.

Maybe I'm being a bit pushy with this decision. Even if I am, it's not that important.

I genuinely believe you can make this work. And even if you fail, don't let it get to you. Don't turn this into your ultimate goal or some measure of your worth, because it really is not. It's a simple challenge, a learning experience.

And this time, NO MORE INVOLVING ILIES. If you SUCCEED, you SUCCEED. If you FAIL, you FAIL. End of STORY.`,

`I made quite a few changes in the last repository commit, stabilizing the platform, fixing a bug here and there, and optimizing the mobile experience. I think you can safely add others now, if you plan to.

As promised, I will leave you with a fully documented markdown file to help you navigate everything from 0 to 100. I might add it a bit later though, maybe sometime tomorrow if I manage to wake up early (it's past my bedtime 😔).

For now, just stay focused on the repository and maybe start adding your own features to it... maybe the dark mode you wanted so badly. You will, however, need to create your own repository with the platform to host it and handle updates.`,

`Now, moving on to how I will find the platform.

Below, you'll find a button that turns into an input. This input simply sends me a value through the database. It has a maximum length of 20 characters, just enough for a domain name.

So, as you've probably guessed, once you're done buying a domain and hosting the platform, simply send the domain name here. I'll check the database periodically and wait for it.

This input is limited to 3 messages per day, so be careful with your dumb messages.

That's all I had to say. We shall cross paths again. Arrivederci 👋

Byeeeeeeeeeee Mayyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy.`,
];

  return (
    <main className="min-h-screen bg-white text-gray-900">
      {/* soft “paper” background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.10),transparent_35%),radial-gradient(circle_at_90%_25%,rgba(99,102,241,0.10),transparent_40%),radial-gradient(circle_at_30%_90%,rgba(16,185,129,0.08),transparent_45%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(#000_1px,transparent_1px)] [background-size:18px_18px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-16">
        <header className="pt-16 sm:pt-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/80 px-3 py-1 text-xs text-gray-600 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            Read-only archive
          </div>

          <h1 className="mt-6 text-4xl sm:text-5xl font-semibold tracking-tight">
            The lights are off.
          </h1>

          <p className="mt-4 text-lg text-gray-600 leading-relaxed mx-auto max-w-3xl">
            This is it, unfortunately I won't drag onto this platform for more longer
          </p>
        </header>

        <section className="mt-12 sm:mt-14">
          <div className="rounded-3xl border border-gray-200 bg-white/80 backdrop-blur shadow-sm overflow-hidden">
            {/* Note */}
            <div className="p-7 sm:p-10">
              <p className="text-3xl text-gray-500">One last note</p>
              <div className="mt-8">
                <NotePager pages={notePages} lastPageFooter={<LeaveGoodbyeNote />} />
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gray-200" />

          <div className="p-7 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4">
              <div className="text-base font-semibold text-gray-900">Timeline</div>

              <div className="mt-4 relative">

                <div className="space-y-4">
                  <div className="flex gap-3 items-stretch">
                    {/* <div className="mt-4 h-4 w-4 rounded-full border border-gray-300 bg-white" /> */}
                    <div className="w-full rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="text-xs text-gray-500">Started</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {prettyDate(startedAt)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 items-stretch">
                    {/* <div className="mt-4 h-4 w-4 rounded-full border border-gray-300 bg-white" /> */}
                    <div className="w-full rounded-2xl border border-gray-200 bg-white p-4">
                      <div className="text-xs text-gray-500">Last activity</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900">
                        {prettyDate(lastActivityAt)}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

  <div className="lg:col-span-8">
    <div className="flex items-baseline justify-between gap-4">
      <div className="text-base font-semibold text-gray-900">Snapshot</div>
      <div className="text-xs text-gray-500">
        Counts only... but everything is still saved 🫣
      </div>
    </div>

    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
      {totals.map((t) => (
        <div
          key={t.label}
          className="rounded-2xl border border-gray-200 bg-white p-4 min-h-[86px] flex flex-col justify-between"
        >
          <div className="text-2xl font-semibold text-gray-900 leading-none">
            {compact(t.value)}
          </div>
          <div className="text-xs text-gray-500">{t.label}</div>
        </div>
      ))}
    </div>


  </div>
</div>
          </div>
        </section>

        {/* PEOPLE CARD BELOW */}
        <section className="mt-10 sm:mt-12">
          <div className="rounded-3xl border border-gray-200 bg-white/80 backdrop-blur shadow-sm overflow-hidden">
            <div className="p-6 sm:p-7 border-b border-gray-100">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-base font-semibold text-gray-900">People who were here</h2>
                <div className="text-xs text-gray-500">
                  {users.data?.length ? `${users.data.length} shown` : "—"}
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Enjoy your wall-of-fame.
              </p>
            </div>

            <div className="p-6 sm:p-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
{(users.data ?? []).map((u) => {
                const name = u.display_name || u.username;
                const bio = (u.bio || "").trim();

                return (
                  <div
                    key={u.id}
                    className="rounded-3xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden flex flex-col"
                  >
                    {/* Banner */}
                    <div className="relative h-20 bg-gray-50">
                      {u.banner_url ? (
                        <img
                          src={u.banner_url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-r from-gray-50 to-blue-50" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-white/25 to-transparent" />
                    </div>

                    <div className="p-5 flex-1">
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className="relative h-12 w-12 shrink-0 rounded-full overflow-hidden border border-gray-200 bg-gray-50">
                          {u.avatar_url ? (
                            <img
                              src={u.avatar_url}
                              alt={name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-sm font-semibold text-gray-500">
                              {initialLetter(name)}
                            </div>
                          )}
                        </div>

                        {/* Names */}
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 truncate">{name}</div>
                          <div className="text-sm text-gray-500 truncate">@{u.username}</div>
                        </div>
                      </div>

                      {/* Bio */}
                      <div className="mt-4 text-sm text-gray-600 leading-relaxed">
                        {bio ? (
                          <p className="line-clamp-3">{bio}</p>
                        ) : (
                          <p className="text-gray-400 italic">No bio.</p>
                        )}
                      </div>

                      <div className="mt-4 text-xs text-gray-400">
                        Joined {u.created_at ? prettyDate(u.created_at) : "—"}
                      </div>
                    </div>

                    <div className="h-1 w-full bg-gradient-to-r from-blue-200 via-indigo-200 to-purple-200 opacity-70" />
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <footer className="pt-14 text-center text-sm text-gray-500">
          Goodbye...
        </footer>
      </div>
    </main>
  );
}
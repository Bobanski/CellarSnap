import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim().toLowerCase();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .neq("id", user.id)
    .order("display_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let users = data ?? [];
  if (search) {
    users = users.filter((p) => {
      const name = (p.display_name ?? "").toLowerCase();
      const email = (p.email ?? "").toLowerCase();
      return name.includes(search) || email.includes(search);
    });
  }
  return NextResponse.json({ users });
}

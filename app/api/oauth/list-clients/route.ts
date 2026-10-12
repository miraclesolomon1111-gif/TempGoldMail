import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from("oauth_clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && Array.isArray(data)) {
        const sanitized = data.map((c) => ({
          ...c,
          client_secret: "••••••••••••••••••••••••••••••••"
        }));
        return NextResponse.json({ clients: sanitized });
      }
    }

    return NextResponse.json({ clients: [] });
  } catch (err: any) {
    return NextResponse.json({ clients: [], error: err.message }, { status: 500 });
  }
}

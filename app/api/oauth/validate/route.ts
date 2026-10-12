import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const client_id = searchParams.get("client_id");
    const redirect_uri = searchParams.get("redirect_uri");

    if (!client_id) {
      return NextResponse.json({ valid: false, error: "Missing client_id" });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ valid: false, error: "Supabase not configured" });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.from("oauth_clients").select("*").eq("client_id", client_id).single();
    if (error || !data) return NextResponse.json({ valid: false });

    const norm = (u: string) => (u || "").replace("https://www.", "https://").replace(/\/$/, "").trim();
    const savedRedirects: string[] = Array.isArray(data.redirect_uris)
      ? data.redirect_uris
      : (data.redirect_uri ? [data.redirect_uri] : []);

    const isValidRedirect = savedRedirects.some((saved: string) => norm(saved) === norm(redirect_uri || ""));
    if (!isValidRedirect) return NextResponse.json({ valid: false });

    return NextResponse.json({ valid: true, client: data });
  } catch (err: any) {
    return NextResponse.json({ valid: false, error: err.message });
  }
}

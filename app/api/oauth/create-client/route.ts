import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { app_name, app_type, javascript_origins, redirect_uris, user_id } = await req.json();
    const client_id = "gld_" + crypto.randomBytes(12).toString("hex");
    const client_secret = "sec_" + crypto.randomBytes(24).toString("hex");
    const created_at = new Date().toISOString();
    const cleanOrigins = Array.isArray(javascript_origins) ? javascript_origins.filter(Boolean) : (javascript_origins ? [javascript_origins] : []);
    const cleanRedirects = Array.isArray(redirect_uris) ? redirect_uris.filter(Boolean) : (redirect_uris ? [redirect_uris] : []);
    const appType = app_type || "Web application";
    const appName = (app_name || "My App").trim();
    const userId = user_id || "dev_user";

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.from("oauth_clients").insert({
        client_id,
        client_secret,
        app_name: appName,
        app_type: appType,
        javascript_origins: cleanOrigins,
        redirect_uris: cleanRedirects,
        user_id: userId,
        created_at
      });
    }

    return NextResponse.json({
      client_id,
      client_secret,
      app_name: appName,
      app_type: appType,
      javascript_origins: cleanOrigins,
      redirect_uris: cleanRedirects,
      user_id: userId,
      created_at
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

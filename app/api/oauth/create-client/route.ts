import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { app_name, app_type, javascript_origins, redirect_uris } = await req.json();
    const random = crypto.randomBytes(12).toString("hex");
    const appType = app_type || "Web application";

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Not auth" }, { status: 401 });

    await supabase.from('oauth_clients').insert({
      client_id: 'gld_' + random,
      client_secret: 'sec_' + random,
      app_name,
      javascript_origins,
      redirect_uris,
      user_id: user.id,
      owner_email: user.email
    });

    return Response.json({
      client_id: 'gld_' + random,
      client_secret: 'sec_' + random,
      app_name,
      app_type: appType,
      javascript_origins,
      redirect_uris,
      user_id: user.id,
      owner_email: user.email
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const { client_id } = await req.json();
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not auth" }, { status: 401 });
  const { error } = await supabase
    .from('oauth_clients')
    .delete()
    .eq('client_id', client_id)
    .eq('user_id', user.id);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ success: true });
}

import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ clients: [] });
  const { data } = await supabase
    .from('oauth_clients')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  return Response.json({ clients: data || [] });
}

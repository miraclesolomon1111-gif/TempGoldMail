import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve credentials from environment variables or custom localStorage config
export function getSupabaseCredentials() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  const customUrl = localStorage.getItem('goldmailer_supabase_url');
  const customKey = localStorage.getItem('goldmailer_supabase_key');

  const url = customUrl || envUrl;
  const key = customKey || envKey;

  return { url, key, isConfigured: Boolean(url && key) };
}

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key, isConfigured } = getSupabaseCredentials();

  if (!isConfigured) {
    return null;
  }

  if (!clientInstance) {
    try {
      clientInstance = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
    } catch (err) {
      console.warn('Failed to initialize Supabase client:', err);
      return null;
    }
  }

  return clientInstance;
}

export function resetSupabaseClient() {
  clientInstance = null;
}

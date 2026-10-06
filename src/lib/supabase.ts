import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Environment = Record<string, string | undefined>;

const environment = import.meta.env as Environment;
const supabaseUrl = environment.VITE_SUPABASE_URL ?? environment.SUPABASE_URL;
const supabaseAnonKey = environment.VITE_SUPABASE_ANON_KEY ?? environment.SUPABASE_ANON_KEY;

// Validate that the URL is a valid HTTP/HTTPS URL and not a placeholder
const isValidUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// Check for common placeholder values
const isPlaceholder = (value: string): boolean => {
  const placeholders = [
    'your_project_url_here',
    'your-anon-key-here',
    'https://your-project.supabase.co',
    'your_anon_key_here',
  ];
  return placeholders.some(p => value.toLowerCase().includes(p.toLowerCase()));
};

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey && isValidUrl(supabaseUrl) && !isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

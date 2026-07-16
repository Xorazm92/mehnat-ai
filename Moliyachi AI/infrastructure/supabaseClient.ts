import { createClient } from '@supabase/supabase-js';

// Environment variables for Supabase connection
const SUPABASE_URL = (typeof window !== 'undefined' ? (window as any).process?.env?.SUPABASE_URL : process.env.SUPABASE_URL) || '';
const SUPABASE_ANON_KEY = (typeof window !== 'undefined' ? (window as any).process?.env?.SUPABASE_KEY : process.env.SUPABASE_KEY) || '';

// Check if valid credentials are provided
const isValidConfig = () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  if (SUPABASE_URL.includes('your_') || SUPABASE_ANON_KEY.includes('your_')) return false;
  if (SUPABASE_URL.length < 10 || SUPABASE_ANON_KEY.length < 10) return false;
  return true;
};

export const supabase = isValidConfig()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const isSupabaseConfigured = () => !!supabase;

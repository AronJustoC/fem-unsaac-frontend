import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8000';

export async function authenticatedFetch(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('No active session');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
    'Authorization': `Bearer ${session.access_token}`,
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  return response;
}

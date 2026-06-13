import { supabase } from './supabase';
import type { UserRole } from './types';

export async function getUserRole(): Promise<UserRole | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return (user.user_metadata?.role as UserRole) ?? null;
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email: string, password: string, role: UserRole) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { role } },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

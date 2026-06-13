import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getUserRole } from '@/lib/auth';
import type { UserRole } from '@/lib/types';

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/(auth)/login');
      } else {
        const role = await getUserRole();
        redirectToRole(role);
      }
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.replace('/(auth)/login');
      } else if (event === 'SIGNED_IN') {
        const role = await getUserRole();
        redirectToRole(role);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  function redirectToRole(role: UserRole | null) {
    if (role === 'contractor') router.replace('/(contractor)/');
    else if (role === 'subcontractor') router.replace('/(sub)/');
    else router.replace('/(auth)/signup');
  }

  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(contractor)" />
      <Stack.Screen name="(sub)" />
    </Stack>
  );
}

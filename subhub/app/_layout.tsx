import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { registerForPushNotifications } from '@/lib/notifications';
import type { UserRole } from '@/lib/types';

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export default function RootLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';
    let bootstrapTimer: ReturnType<typeof setTimeout>;

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (DEMO) return;
      if (event === 'SIGNED_OUT' || !session) {
        router.replace('/(auth)/');
      } else if (event === 'SIGNED_IN') {
        // Read role from session directly — avoids calling getUser() inside the
        // auth lock callback which deadlocks on web via the Web Locks API.
        const role = (session.user.user_metadata?.role as UserRole) ?? null;
        redirectToRole(role);
        registerForPushNotifications().catch(() => {});
      }
    });

    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.jobId) {
        getUserRole().then(role => {
          if (role === 'contractor') router.push(`/(contractor)/jobs/${data.jobId}`);
          else if (role === 'subcontractor') router.push(`/(sub)/jobs/${data.jobId}`);
        });
      }
    });

    // Small delay lets Expo Router mount the Stack before first navigation
    bootstrapTimer = setTimeout(async () => {
      // Demo mode: skip auth check (used for screenshots / design review)
      if (process.env.EXPO_PUBLIC_DEMO === '1') {
        setReady(true);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/(auth)/');
      } else {
        const role = (session.user.user_metadata?.role as UserRole) ?? null;
        redirectToRole(role);
        registerForPushNotifications().catch(() => {});
      }
      setReady(true);
    }, 50);

    return () => {
      clearTimeout(bootstrapTimer);
      listener.subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  function redirectToRole(role: UserRole | null) {
    if (role === 'contractor') router.replace('/(contractor)/');
    else if (role === 'subcontractor') router.replace('/(sub)/');
    else if (role === 'admin') router.replace('/(admin)/');
    else router.replace('/(auth)/signup');
  }

  return (
    <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier="merchant.com.subhub.app">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(contractor)" />
        <Stack.Screen name="(sub)" />
        <Stack.Screen name="(admin)" />
      </Stack>
    </StripeProvider>
  );
}

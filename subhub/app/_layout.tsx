import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { getUserRole } from '@/lib/auth';
import { registerForPushNotifications } from '@/lib/notifications';
import { captureEntryParams, consumePendingJob } from '@/lib/pendingLink';
import type { UserRole } from '@/lib/types';

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export default function RootLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';
    let bootstrapTimer: ReturnType<typeof setTimeout>;

    // Stash any ?ref / ?job from a shared link before auth redirects clear them.
    captureEntryParams();

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
          if (role === 'contractor') router.push(`/(contractor)/jobs/${data.jobId}` as any);
          else if (role === 'subcontractor') router.push(`/(sub)/jobs/${data.jobId}` as any);
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
    if (role === 'contractor') router.replace('/(contractor)/home' as any);
    else if (role === 'subcontractor') {
      // A shared job link (account gate): drop the signed-in sub straight onto
      // the full job card instead of the home splash.
      consumePendingJob().then(jobId => {
        if (jobId) router.replace(`/(sub)/jobs/${jobId}` as any);
        else router.replace('/(sub)/home' as any);
      }).catch(() => router.replace('/(sub)/home' as any));
    }
    else if (role === 'admin') router.replace('/(admin)/' as any);
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

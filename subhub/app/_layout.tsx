import { useEffect, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { getUserRole } from '@/lib/auth';
import { registerForPushNotifications } from '@/lib/notifications';
import type { UserRole } from '@/lib/types';

const STRIPE_PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export default function RootLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/(auth)/login');
      } else {
        const role = await getUserRole();
        redirectToRole(role);
        // Register push token after confirming session
        registerForPushNotifications().catch(() => {});
      }
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.replace('/(auth)/login');
      } else if (event === 'SIGNED_IN') {
        const role = await getUserRole();
        redirectToRole(role);
        registerForPushNotifications().catch(() => {});
      }
    });

    // Handle notification taps while app is in background/killed
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.jobId) {
        // Navigate to relevant job detail — role determines route
        getUserRole().then(role => {
          if (role === 'contractor') router.push(`/(contractor)/jobs/${data.jobId}`);
          else if (role === 'subcontractor') router.push(`/(sub)/jobs/${data.jobId}`);
        });
      }
    });

    return () => {
      listener.subscription.unsubscribe();
      sub.remove();
    };
  }, []);

  function redirectToRole(role: UserRole | null) {
    if (role === 'contractor') router.replace('/(contractor)/');
    else if (role === 'subcontractor') router.replace('/(sub)/');
    else router.replace('/(auth)/signup');
  }

  if (!ready) return null;

  return (
    <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier="merchant.com.subhub.app">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(contractor)" />
        <Stack.Screen name="(sub)" />
      </Stack>
    </StripeProvider>
  );
}

import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="login" options={{ title: 'Sign In', headerShown: false }} />
      <Stack.Screen name="signup" options={{ title: 'Create Account', headerShown: false }} />
      <Stack.Screen name="onboard-contractor" options={{ title: 'Business Profile' }} />
      <Stack.Screen name="onboard-sub" options={{ title: 'Pro Profile' }} />
    </Stack>
  );
}

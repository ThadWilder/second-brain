import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors, fontSize } from '@/lib/theme';

export default function SubLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textLight,
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
        tabBarStyle: { borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Job Board', tabBarIcon: ({ color }) => <Icon e="🔍" c={color} /> }} />
      <Tabs.Screen name="my-jobs" options={{ title: 'My Jobs', tabBarIcon: ({ color }) => <Icon e="🔨" c={color} /> }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: ({ color }) => <Icon e="💬" c={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Icon e="👤" c={color} /> }} />
      {/* Hidden routes — no tab */}
      <Tabs.Screen name="jobs/[id]" options={{ href: null }} />
      <Tabs.Screen name="chat/[jobId]" options={{ href: null, title: 'Chat' }} />
      <Tabs.Screen name="rate/[jobId]" options={{ href: null, title: 'Leave a Review' }} />
      <Tabs.Screen name="change-order" options={{ href: null, title: 'Change Order' }} />
      <Tabs.Screen name="connect-stripe" options={{ href: null, title: 'Payout Account' }} />
    </Tabs>
  );
}

function Icon({ e, c }: { e: string; c: string }) {
  return <Text style={{ fontSize: 20, opacity: c === colors.accent ? 1 : 0.4 }}>{e}</Text>;
}

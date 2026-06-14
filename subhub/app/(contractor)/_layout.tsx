import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors, fontSize } from '@/lib/theme';

export default function ContractorLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
        tabBarStyle: { borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'My Jobs', tabBarIcon: ({ color }) => <Icon e="📋" c={color} /> }} />
      <Tabs.Screen name="post-job" options={{ title: 'Post Job', tabBarIcon: ({ color }) => <Icon e="➕" c={color} /> }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages', tabBarIcon: ({ color }) => <Icon e="💬" c={color} /> }} />
      <Tabs.Screen name="subs" options={{ title: 'Find Subs', tabBarIcon: ({ color }) => <Icon e="🔍" c={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Icon e="👤" c={color} /> }} />
      {/* Hidden routes — no tab */}
      <Tabs.Screen name="jobs/[id]" options={{ href: null }} />
      <Tabs.Screen name="chat/[jobId]" options={{ href: null, title: 'Chat' }} />
      <Tabs.Screen name="change-order" options={{ href: null, title: 'Change Order' }} />
      <Tabs.Screen name="add-payment" options={{ href: null, title: 'Payment Method' }} />
    </Tabs>
  );
}

function Icon({ e, c }: { e: string; c: string }) {
  return <Text style={{ fontSize: 20, opacity: c === colors.primary ? 1 : 0.4 }}>{e}</Text>;
}

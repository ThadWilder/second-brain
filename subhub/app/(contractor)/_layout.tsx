import { Tabs } from 'expo-router';
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
      <Tabs.Screen
        name="index"
        options={{ title: 'My Jobs', tabBarIcon: ({ color }) => <TabIcon emoji="📋" color={color} /> }}
      />
      <Tabs.Screen
        name="post-job"
        options={{ title: 'Post Job', tabBarIcon: ({ color }) => <TabIcon emoji="➕" color={color} /> }}
      />
      <Tabs.Screen
        name="jobs/[id]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <TabIcon emoji="👤" color={color} /> }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, opacity: color === colors.primary ? 1 : 0.5 }}>{emoji}</Text>;
}

import { Text } from 'react-native';

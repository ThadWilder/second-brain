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
      <Tabs.Screen
        name="index"
        options={{ title: 'Job Board', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, opacity: color === colors.accent ? 1 : 0.5 }}>🔍</Text> }}
      />
      <Tabs.Screen
        name="my-jobs"
        options={{ title: 'My Jobs', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, opacity: color === colors.accent ? 1 : 0.5 }}>🔨</Text> }}
      />
      <Tabs.Screen
        name="jobs/[id]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, opacity: color === colors.accent ? 1 : 0.5 }}>👤</Text> }}
      />
    </Tabs>
  );
}

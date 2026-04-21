import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4ECDC4',
        tabBarInactiveTintColor: '#555',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#16213e',
          borderTopColor: '#0f3460',
          borderTopWidth: 1,
          elevation: 0,
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom + 12,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 12,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="bookmark.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol size={30} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}

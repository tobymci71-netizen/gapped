import { Tabs } from 'expo-router';
import React from 'react';
import { TabIcon } from '@/components/TabIcon';
import { haptic } from '@/lib/haptics';
import { color, font } from '@/theme/tokens';

/**
 * Four tabs. The reference app puts a territory game in the third slot; we ship
 * the Garage there instead — territory is unverified, non-parity work (spec
 * §3.3) and a stub screen is worse than no screen.
 */
export default function TabsLayout() {
  return (
    <Tabs
      // One listener for the whole navigator: every tab press is a selection.
      screenListeners={{ tabPress: () => haptic.selection() }}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.canvas },
        tabBarStyle: {
          backgroundColor: color.surface1,
          borderTopColor: color.hairline,
        },
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.text3,
        tabBarLabelStyle: { fontFamily: font.bodyMedium, fontSize: 11, lineHeight: 14 },
      }}
    >
      <Tabs.Screen
        name="drive"
        options={{
          title: 'Driving',
          tabBarIcon: ({ focused }) => <TabIcon name="driving" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="board"
        options={{
          title: 'Ranks',
          tabBarIcon: ({ focused }) => <TabIcon name="ranks" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: 'Garage',
          tabBarIcon: ({ focused }) => <TabIcon name="garage" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ focused }) => <TabIcon name="you" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

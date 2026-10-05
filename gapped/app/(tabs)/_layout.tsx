import { Tabs } from 'expo-router';
import React from 'react';
import { TAB_TINT, TabIcon } from '@/components/TabIcon';
import { haptic } from '@/lib/haptics';
import { color, font, textStyle, type } from '@/theme/tokens';

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
        // The bar is part of the night, not a panel over it: canvas, with a
        // divider for an edge. The active tab is white with a red light above
        // it (TabIcon); everything else is grey.
        tabBarStyle: {
          backgroundColor: color.canvas,
          borderTopColor: color.divider,
        },
        tabBarActiveTintColor: TAB_TINT.active,
        tabBarInactiveTintColor: TAB_TINT.inactive,
        tabBarLabelStyle: { fontFamily: font.bodySemibold, ...textStyle(type.small) },
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

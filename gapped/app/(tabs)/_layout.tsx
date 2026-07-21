import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { color, font } from '@/theme/tokens';

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, color: focused ? color.accent : color.text3 }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.canvas },
        tabBarStyle: {
          backgroundColor: color.surface1,
          borderTopColor: color.hairline,
        },
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.text3,
        tabBarLabelStyle: { fontFamily: font.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="drive"
        options={{
          title: 'Drive',
          tabBarIcon: ({ focused }) => <TabIcon glyph="◉" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="board"
        options={{
          title: 'Board',
          tabBarIcon: ({ focused }) => <TabIcon glyph="▲" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: 'Garage',
          tabBarIcon: ({ focused }) => <TabIcon glyph="⌂" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ focused }) => <TabIcon glyph="●" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, gutter, space } from '@/theme/tokens';

type Props = {
  children: React.ReactNode;
  /** Scrollable content (default true). Fixed layouts (live drive HUD) pass false. */
  scroll?: boolean;
  style?: ViewStyle;
  /** Pinned below the scroll area, above the home indicator — the fixed-CTA pattern. */
  footer?: React.ReactNode;
};

export function Screen({ children, scroll = true, style, footer }: Props) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }, style]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, { paddingTop: insets.top + 12 }, style]}>
      {children}
    </View>
  );

  return (
    // Both onboarding text-entry steps pin their Continue button to the
    // footer, and without this the keyboard covered it while the field it
    // belongs to was focused.
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: color.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {body}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: gutter, paddingBottom: space.xxl },
  footer: { paddingHorizontal: gutter, paddingTop: space.md, backgroundColor: color.canvas },
});

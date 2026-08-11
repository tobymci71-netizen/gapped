import React, { createContext, useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, gutter, space } from '@/theme/tokens';

/**
 * How much of the bottom of the screen the pinned footer covers, safe-area
 * inset included.
 *
 * A body that hosts its own full-bleed list needs this: the footer is opaque
 * and sits over the bottom of the screen, so a list that ends where the footer
 * begins can never scroll its final row clear of it. The country picker's last
 * entry — Zimbabwe — sat permanently half-under the Continue button.
 *
 * Published from here rather than recomputed by each caller, because the
 * alternative is every list re-deriving `space.md + buttonHeight +
 * max(insets.bottom, 16) + 14` and drifting the moment the footer changes.
 */
const FooterHeightContext = createContext(0);

/** Height of the pinned footer, or 0 when the screen has none. */
export function useFooterHeight(): number {
  return useContext(FooterHeightContext);
}

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
  const [footerHeight, setFooterHeight] = useState(0);
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
      <FooterHeightContext.Provider value={footerHeight}>{body}</FooterHeightContext.Provider>
      {footer ? (
        <View
          style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}
          onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
        >
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

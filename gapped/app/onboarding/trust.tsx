import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { OnSurface, Text } from '@/components/Text';
import { LockGlyph, ShieldGlyph } from '@/onboarding/identity/glyphs';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { color, radius, space } from '@/theme/tokens';

/** The grey disc the shield sits in. */
const BADGE = 88;
/** The lime lock's tile in the card. */
const TILE = 40;
/**
 * How far the headline grows with Dynamic Type: the cap every onboarding
 * title uses (OnboardingFrame), past which the wide display face breaks
 * "trusting" in half.
 */
const HEADLINE_MAX_SCALE = 1.5;

/**
 * Privacy reassurance (docs/ONBOARDING.md, step 11). No form, no toggle: a
 * moment between handing over a username and being asked anything else, which
 * says what happens to the route before anyone else can see it.
 *
 * Every sentence on it has to stay true of the app as it ships: a reassurance
 * screen that overstated anything would be the one place a "board you can
 * believe" told a lie about itself. The trimming is real — src/drive/privacy.ts
 * cuts 1.0–1.7 mi (salted, per drive) from both ends before a drive is shown
 * or ranked — and "no ads, never sold" is the promise Settings already makes
 * under Privacy. The contract's first draft also said "you choose what
 * appears on your profile. Change it any time in Settings", but Settings has
 * no such controls, so that sentence is gone until it does.
 *
 * The heading is drawn here rather than by the frame, because the shield sits
 * above it and the whole group is centred in the room the step has.
 */
export default function TrustStep() {
  const advance = useOnboardingAdvance('/onboarding/trust');

  return (
    <OnboardingFrame
      route="/onboarding/trust"
      footer={<Button label="Continue" variant="light" onPress={advance} />}
    >
      <View style={styles.centre}>
        <Entrance index={0} style={styles.badgeWrap}>
          <View style={styles.badge}>
            <ShieldGlyph size={40} color={color.text1} />
          </View>
        </Entrance>

        <Entrance index={1}>
          {/* "standard" is iOS's own breaking, which will not strand "us." on a line by itself. */}
          <Text
            variant="headline"
            accessibilityRole="header"
            lineBreakStrategyIOS="standard"
            maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
            style={styles.title}
          >
            Thanks for trusting us.
          </Text>
        </Entrance>

        <Entrance index={2}>
          <View style={styles.card}>
            <OnSurface>
              <View style={styles.tile}>
                <LockGlyph size={22} color={color.accent} />
              </View>
              <View style={styles.cardText}>
                <Text variant="bodyMedium">Your privacy matters to us.</Text>
                <Text variant="caption" style={styles.cardBody}>
                  Your route is trimmed at both ends before anyone sees it. No ads, and your data is
                  never sold.
                </Text>
              </View>
            </OnSurface>
          </View>
        </Entrance>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  // Centred in the step's room, nudged above the middle so the group sits
  // where the eye lands rather than sagging toward the button.
  centre: { flex: 1, justifyContent: 'center', paddingBottom: space.xxl, gap: space.xl },
  badgeWrap: { alignItems: 'center' },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.card,
    backgroundColor: color.surface2,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: 12,
    backgroundColor: color.accentTile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: space.xs },
  cardBody: { color: color.text2 },
});

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { OnSurface, Text } from '@/components/Text';
import { TERMS_ROUTE } from '@/onboarding/flow';
import { EyeGlyph, LockGlyph, ShieldGlyph } from '@/onboarding/identity/glyphs';
import { ConsentCheck, LinkedSentence } from '@/onboarding/place/Consent';
import {
  AGE_CHECK,
  canAgree,
  PRIVACY_LINK,
  PUBLIC_DATA_LINE,
  TERMS_SENTENCE,
} from '@/onboarding/place/consentCopy';
import { panel } from '@/onboarding/ui/choice';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { useProfile } from '@/state/profile';
import { color, space } from '@/theme/tokens';

/** The ring the shield sits in. */
const BADGE = 88;
/** The glyph column in the cards: the glyphs line up, the words after them. */
const GLYPH_BOX = 28;
/**
 * How far the headline grows with Dynamic Type: the cap every onboarding
 * title uses (OnboardingFrame), past which the wide display face breaks
 * "trusting" in half.
 */
const HEADLINE_MAX_SCALE = 1.5;

/**
 * Whether this step asks for the terms. Only with SAFETY_ACKNOWLEDGEMENT off:
 * otherwise the safety step does, as the last question before setup, and
 * asking here too would be asking twice (TERMS_ROUTE, src/onboarding/flow.ts).
 */
const ASKS_TERMS = TERMS_ROUTE === '/onboarding/trust';

/** "Read the Privacy Policy", with the policy's name as the link. */
const PRIVACY_SENTENCE = ['Read the', PRIVACY_LINK] as const;

/**
 * Privacy reassurance (docs/ONBOARDING.md, step 11). A moment between handing
 * over a username and being asked anything else, which says plainly what
 * becomes public and what never does, before anything is.
 *
 * Every sentence on it has to stay true of the app as it ships: a reassurance
 * screen that overstated anything would be the one place a "board you can
 * believe" told a lie about itself. What is public is exactly what the boards
 * show (PUBLIC_DATA_LINE, src/onboarding/place/consentCopy.ts, says why each
 * clause holds). Routes are their owner's alone; the one way a route leaves
 * the phone for anyone else is a share card the driver makes, and that is
 * trimmed 1.0–1.7 mi at both ends first (src/drive/privacy.ts). "No ads,
 * never sold" is the promise Settings already makes under Privacy. The
 * contract's first draft also said "you choose what appears on your profile.
 * Change it any time in Settings", but Settings has no such controls, so that
 * sentence is gone until it does.
 *
 * With SAFETY_ACKNOWLEDGEMENT off this is also where the driver confirms they
 * are 18 or older with a driving licence and agrees to the Terms of Use and
 * Privacy Policy: one box, required, and Continue records it
 * (`acceptTerms()`). With it on, the safety step asks, and this step only
 * informs.
 *
 * The heading is drawn here rather than by the frame, because the shield sits
 * above it and the whole group is centred in the room the step has.
 */
export default function TrustStep() {
  const advance = useOnboardingAdvance('/onboarding/trust');
  const acceptTerms = useProfile((s) => s.acceptTerms);
  const [age, setAge] = useState(false);
  const agreed = !ASKS_TERMS || canAgree([age]);

  return (
    <OnboardingFrame
      route="/onboarding/trust"
      footer={
        <Button
          label="Continue"
          variant="light"
          disabled={!agreed}
          onPress={() => {
            if (ASKS_TERMS) acceptTerms();
            advance();
          }}
        />
      }
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

        <Entrance index={2} style={styles.cards}>
          <InfoCard
            Glyph={LockGlyph}
            title="Your privacy matters to us."
            body="No ads, and your data is never sold. A route you choose to share is trimmed at both ends first."
          />
          <InfoCard Glyph={EyeGlyph} title="What others see" body={PUBLIC_DATA_LINE} />
          <LinkedSentence runs={PRIVACY_SENTENCE} align="center" />
        </Entrance>

        {ASKS_TERMS ? (
          <Entrance index={3} style={styles.cards}>
            <ConsentCheck label={AGE_CHECK} checked={age} onToggle={() => setAge((c) => !c)} />
            <LinkedSentence runs={TERMS_SENTENCE} align="center" />
          </Entrance>
        ) : null}
      </View>
    </OnboardingFrame>
  );
}

/** A stroke glyph beside a short title and its explanation, on a night panel. */
function InfoCard({
  Glyph,
  title,
  body,
}: {
  Glyph: typeof LockGlyph;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.card}>
      <OnSurface>
        <View style={styles.glyph}>
          <Glyph size={22} color={color.text2} />
        </View>
        <View style={styles.cardText}>
          <Text variant="bodyMedium">{title}</Text>
          <Text variant="caption" style={styles.cardBody}>
            {body}
          </Text>
        </View>
      </OnSurface>
    </View>
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
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  cards: { gap: space.md },
  card: {
    ...panel,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.lg,
  },
  glyph: { width: GLYPH_BOX, alignItems: 'center', paddingTop: 1 },
  cardText: { flex: 1, gap: space.xs },
  cardBody: { color: color.text2 },
});

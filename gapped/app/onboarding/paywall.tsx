import { Redirect, Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  type LayoutChangeEvent,
  Linking,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Button } from '@/components/Button';
import { Entrance } from '@/components/Entrance';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { PressableScale } from '@/components/PressableScale';
import { SHARE_CARD_RENDER, ShareCard } from '@/components/ShareCard';
import { Text } from '@/components/Text';
import { PAYWALL_PLACEHOLDER_PRICES } from '@/config/flags';
import { PRIVACY_URL, TERMS_URL } from '@/config/links';
import { PAYWALL_PRO_NOTE, paywallRedirect, PRO_PLANS, type ProPlan } from '@/config/plans';
import { haptic } from '@/lib/haptics';
import { CheckGlyph, CloseGlyph } from '@/onboarding/identity/glyphs';
import { SAMPLE_DRIVE } from '@/onboarding/identity/sampleDrive';
import { useHardwareBack } from '@/onboarding/identity/useHardwareBack';
import { Wordmark } from '@/onboarding/identity/Wordmark';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { useProfile } from '@/state/profile';
import { duration, easing } from '@/theme/motion';
import { color, font, glyph, radius, space, textStyle } from '@/theme/tokens';

type Plan = ProPlan;

/**
 * The two plans, monthly first and preselected (PRO_PLANS). Prices are
 * PAYWALL_PLACEHOLDER_PRICES until RevenueCat supplies localised ones, and
 * there is no "was" price, per-week breakdown or deal badge: nothing has been
 * priced, so nothing can be discounted.
 */
const PLANS: readonly { key: Plan; title: string; price: string }[] = PRO_PLANS.map((p) => ({
  key: p.key,
  title: p.title,
  price: PAYWALL_PLACEHOLDER_PRICES[p.key],
}));

const UNAVAILABLE = "Gapped Pro isn't available yet";
const PURCHASE_STUB =
  "Purchases aren't switched on in this version of Gapped, so nothing has been charged. " +
  'Everything else is yours to use now.';
const RESTORE_STUB = "There's nothing to restore yet, and nothing has been charged.";

/** The close button's visible disc; the touch target around it is 44pt. */
const CLOSE_DISC = 30;
/** Plan radio. */
const RADIO = 22;
/** The smallest the hero card is drawn to avoid scrolling; below it, the page scrolls instead. */
const MIN_HERO = 180;
/** How far the SAMPLE tab rises above the card's top edge (see SampleCard). */
const TAB_RISE = 10;
/** The top row: wordmark and the close button's 44pt target. */
const TOP_ROW = 44;
/**
 * Up to this text scale the plans sit in the pinned footer, side by side with
 * the button. Past it they cannot: stacked, with the links wrapping, the
 * footer outgrew the screen at the accessibility sizes — a pinned footer does
 * not scroll, so the button and the prices were cut off on a 667pt phone.
 * They move into the page instead, and only the button stays pinned.
 */
const PLANS_IN_FOOTER_MAX_SCALE = 1.3;

/**
 * The card's size for the room the hero slot was given: as large as fits, up
 * to the card's own 360pt, and never under MIN_HERO (the slot's min height
 * makes the page scroll instead).
 */
function heroSize(slot: { width: number; height: number }): number {
  return Math.round(
    Math.max(MIN_HERO, Math.min(SHARE_CARD_RENDER, slot.width, slot.height - TAB_RISE)),
  );
}

/**
 * /onboarding/paywall. The flow only routes here with ONBOARDING_PAYWALL on;
 * with it off, a deep link is sent back to the start of onboarding
 * (paywallRedirect, src/config/plans.ts) rather than drawing a paywall that
 * cannot charge, or finishing onboarding past steps it never showed. A
 * wrapper, so the screen's hooks are never called conditionally.
 */
export default function PaywallRoute() {
  const redirect = paywallRedirect();
  return redirect ? <Redirect href={redirect} /> : <PaywallStep />;
}

/**
 * Gapped Pro (docs/ONBOARDING.md, paywall). Reached only when
 * ONBOARDING_PAYWALL is on, after "You're all set".
 *
 * Always dismissible (rule 5): the close button, Android's back button and
 * both stubs all finish onboarding exactly as buying would, so there is no
 * path through this screen that strands anyone. The reference shows no close
 * button at all; this small X, top right, is the addition its own notes allow
 * for an app that must be dismissible.
 *
 * Purchase and restore are stubs until RevenueCat is wired. They say so in
 * plain words and charge nothing — a TestFlight build must not show a button
 * that pretends to take money, which is why the flag defaults off.
 *
 * Left out from the reference on purpose: the star rating, "1M+ miles
 * tracked", the deal badge and the struck-through price. Each is a number
 * Gapped does not have (rule 1).
 *
 * The pitch sells depth, which is what Pro is (src/config/plans.ts): the
 * full history, cornering G, class brackets and clean share cards, and it
 * says in the same sentence that recording and the boards stay free. The
 * hero is still the sample share card, the reference's shape, drawn as every
 * plan draws it, GAPPED badge and all.
 */
function PaywallStep() {
  const finish = useOnboardingAdvance('/onboarding/paywall');
  useHardwareBack(finish);
  const [plan, setPlan] = useState<Plan>(PLANS[0].key);

  // The plans live with the button, not above the fold: on a 667pt SE they
  // used to scroll out of sight, leaving a buy button with no price beside
  // it. Side by side there; past PLANS_IN_FOOTER_MAX_SCALE, stacked in the
  // page above the pinned button instead.
  const { fontScale } = useWindowDimensions();
  const plansInFooter = fontScale <= PLANS_IN_FOOTER_MAX_SCALE;

  // The card is a fixed 360pt square, drawn as large as the page allows
  // without scrolling. The room is measured, not worked out: the hero slot
  // takes whatever height the top row, the pitch and the footer leave (and
  // at least MIN_HERO, past which the page scrolls), and the card is sized to
  // it. The card sits in the slot absolutely, so it never feeds back into the
  // slot's own height. Working it out from the window instead meant restating
  // Screen's private paddings here, which drift the moment Screen changes.
  const [slot, setSlot] = useState<{ width: number; height: number } | null>(null);
  const onSlotLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSlot((s) => (s && s.width === width && s.height === height ? s : { width, height }));
  };

  const unavailable = (message: string) =>
    Alert.alert(UNAVAILABLE, message, [{ text: 'OK', onPress: finish }], {
      cancelable: true,
      onDismiss: finish,
    });

  const plans = (
    <View
      accessibilityRole="radiogroup"
      style={[styles.plans, !plansInFooter && styles.plansStacked]}
    >
      {PLANS.map((p) => (
        <PlanCard
          key={p.key}
          title={p.title}
          price={p.price}
          selected={plan === p.key}
          stacked={!plansInFooter}
          onPress={() => setPlan(p.key)}
        />
      ))}
    </View>
  );
  const unlock = (
    <Button label="Unlock Gapped Pro" variant="primary" onPress={() => unavailable(PURCHASE_STUB)} />
  );
  const links = (
    <View style={styles.links}>
      <FooterLink label="Terms of Use" onPress={() => openLink(TERMS_URL)} />
      <FooterLink label="Privacy Policy" onPress={() => openLink(PRIVACY_URL)} />
      <FooterLink label="Restore Purchases" onPress={() => unavailable(RESTORE_STUB)} />
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <OnboardingFrame
        route="/onboarding/paywall"
        footer={
          plansInFooter ? (
            <View style={styles.footer}>
              {plans}
              {unlock}
              {links}
            </View>
          ) : (
            unlock
          )
        }
      >
        <View style={styles.topRow}>
          <View style={styles.topSide} />
          <Wordmark />
          <PressableScale
            onPress={finish}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={space.xs}
            style={styles.close}
          >
            <View style={styles.closeDisc}>
              <CloseGlyph size={16} color={color.text2} />
            </View>
          </PressableScale>
        </View>

        <View style={styles.heroSlot} onLayout={onSlotLayout}>
          {/*
            No Entrance on the card: it mounts on the slot's first layout,
            while the screen is still being pushed, and its route is a Skia
            canvas. An opacity entrance on a Skia canvas's ancestor, started
            during a push, stalled at about a third of its brightness on
            device (src/onboarding/vehicle/VehicleArt.tsx). The push is the
            card's entrance; the pitch below still rises in after it.
          */}
          {slot ? (
            <View style={styles.heroCentre}>
              <SampleCard size={heroSize(slot)} />
            </View>
          ) : null}
        </View>

        <Entrance index={1}>
          <View style={styles.pitch}>
            {/*
              The carousel's Pro page has the same words over the cornering
              demo, so the paywall closes the promise it opened.
            */}
            <Text variant="cardTitle" accessibilityRole="header" style={styles.centerText}>
              See more in every drive
            </Text>
            {/*
              What Pro adds, then what stays free: one sentence, held to the
              published matrix by a test (PAYWALL_PRO_NOTE). This used to be
              "Share your best drives" over a small print correction, because
              share cards are free; Pro is depth now, and the depth is the
              pitch.
            */}
            <Text variant="body" style={styles.centerText}>
              {PAYWALL_PRO_NOTE.text}
            </Text>
          </View>
        </Entrance>

        {plansInFooter ? null : (
          <Entrance index={2}>
            <View style={styles.footer}>
              {plans}
              {links}
            </View>
          </Entrance>
        )}
      </OnboardingFrame>
    </>
  );
}

function openLink(url: string): void {
  Linking.openURL(url).catch(() => undefined);
}

/**
 * The real ShareCard, drawn from the sample drive and scaled to fit, with a
 * SAMPLE chip on it. Personal where it honestly can be — the person's own
 * username and units — and sample everywhere else. It wears no VERIFIED
 * badge, because no server verified it: ShareCard only ever shows that badge
 * for a server verdict, and a sample does not get to borrow one.
 *
 * Not their car, though. The card prints the vehicle beside the figures, so
 * "@toby · Fiat Panda" over a 6.40 s 0–60 would state an invented time for a
 * real car the person owns — one it may be nowhere near (rule 1). Their name
 * is theirs to put on a sample; their car's numbers are not ours to make up.
 */
function SampleCard({ size }: { size: number }) {
  const unitPref = useProfile((s) => s.unitPref);
  const username = useProfile((s) => s.username);
  const scale = size / SHARE_CARD_RENDER;

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Sample share card"
    >
      <View style={[styles.hero, { width: size, height: size }]}>
        <View style={[styles.heroCard, { transform: [{ scale }] }]}>
          <ShareCard
            summary={SAMPLE_DRIVE.summary}
            fixes={SAMPLE_DRIVE.fixes}
            unitPref={unitPref}
            username={username}
            vehicle={null}
            verification={null}
          />
        </View>
        {/* Drawn over the card, not around it, so the border never nudges the scaled card. */}
        <View style={[StyleSheet.absoluteFill, styles.heroBorder]} />
      </View>
      {/*
        Outside the card and unscaled, straddling its top edge: legible at any
        size the card is drawn, and over nothing the card itself shows.
      */}
      <View style={styles.sampleRow}>
        <View style={styles.sample}>
          <Text style={styles.sampleText} maxFontSizeMultiplier={1.5}>
            SAMPLE
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * One plan: name and radio on top, price beneath. The selected card takes the
 * lime outline and a filled radio; the other clears to a plain surface
 * (docs/ONBOARDING.md).
 *
 * Side by side, each card takes half the row and both match the taller one's
 * height. Stacked, each is simply as tall as it needs: `flex: 1` in a column
 * of no set height leaves the cards' height to the layout engine's legacy
 * stretch rules, which is no way to size the one thing carrying the price.
 */
function PlanCard({
  title,
  price,
  selected,
  stacked,
  onPress,
}: {
  title: string;
  price: string;
  selected: boolean;
  stacked: boolean;
  onPress: () => void;
}) {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.set(withTiming(selected ? 1 : 0, { duration: duration.fast, easing: easing.standard }));
  }, [selected, on]);
  const outline = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.value, [0, 1], [color.surface2, color.accent]),
  }));
  const ring = useAnimatedStyle(() => ({
    borderColor: interpolateColor(on.value, [0, 1], [color.text3, color.accent]),
    backgroundColor: interpolateColor(on.value, [0, 1], [color.surface2, color.accent]),
  }));
  const tick = useAnimatedStyle(() => ({ opacity: on.value }));

  return (
    <PressableScale
      silent
      onPress={() => {
        if (!selected) haptic.selection();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityLabel={`${title}, ${price}`}
      accessibilityState={{ checked: selected }}
      style={stacked ? undefined : styles.planSlot}
    >
      <Animated.View style={[styles.plan, !stacked && styles.planFill, outline]}>
        <View style={styles.planTop}>
          <Text variant="bodyMedium" style={styles.planTitle}>
            {title}
          </Text>
          <Animated.View style={[styles.radio, ring]}>
            <Animated.View style={tick}>
              <CheckGlyph size={14} color={color.onAccent} />
            </Animated.View>
          </Animated.View>
        </View>
        <Text variant="body" style={styles.planPrice}>
          {price}
        </Text>
      </Animated.View>
    </PressableScale>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole={label === 'Restore Purchases' ? 'button' : 'link'}
      accessibilityLabel={label}
      style={styles.link}
    >
      <Text variant="legal" style={styles.linkText}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Balances the close button, so the wordmark sits on the screen's centre line.
  topSide: { width: TOP_ROW },
  close: {
    width: TOP_ROW,
    height: TOP_ROW,
    marginRight: -space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeDisc: {
    width: CLOSE_DISC,
    height: CLOSE_DISC,
    borderRadius: CLOSE_DISC / 2,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Grows into whatever height the page has left; its min height is the
  // point past which the page scrolls rather than shrink the card further.
  heroSlot: { flexGrow: 1, minHeight: MIN_HERO + TAB_RISE },
  // The card, centred in the slot without sizing it. The top inset keeps the
  // SAMPLE tab, which rises above the card, inside the slot.
  heroCentre: {
    ...StyleSheet.absoluteFill,
    paddingTop: TAB_RISE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { borderRadius: radius.card, overflow: 'hidden' },
  heroCard: {
    width: SHARE_CARD_RENDER,
    height: SHARE_CARD_RENDER,
    transformOrigin: 'top left',
  },
  heroBorder: { borderRadius: radius.card, borderWidth: 1, borderColor: color.hairline },
  sampleRow: { position: 'absolute', top: -TAB_RISE, left: 0, right: 0, alignItems: 'center' },
  sample: {
    borderWidth: 1,
    borderColor: color.text3,
    borderRadius: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    backgroundColor: color.canvas,
  },
  sampleText: {
    fontFamily: font.bodySemibold,
    ...textStyle(glyph.sm),
    letterSpacing: 1.2,
    color: color.text2,
  },
  pitch: { gap: space.sm, marginTop: space.sm },
  centerText: { textAlign: 'center' },
  plans: { flexDirection: 'row', gap: space.md, marginBottom: space.xs },
  plansStacked: { flexDirection: 'column' },
  planSlot: { flex: 1 },
  planFill: { flex: 1 },
  plan: {
    gap: space.xs,
    minHeight: 72,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.card,
    borderWidth: 2,
    backgroundColor: color.surface2,
  },
  planTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  radio: {
    width: RADIO,
    height: RADIO,
    borderRadius: RADIO / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: { flex: 1 },
  planPrice: { color: color.text1 },
  footer: { gap: space.sm },
  // One line on a 375pt phone at default size; wraps, rather than clips, past it.
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: -space.xs },
  link: {
    minHeight: 44,
    paddingHorizontal: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { color: color.text2 },
});

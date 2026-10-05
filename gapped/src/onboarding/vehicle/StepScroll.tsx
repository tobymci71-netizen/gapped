import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Keyboard, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { StepTitle } from '@/onboarding/ui/StepTitle';
import { space } from '@/theme/tokens';
import { scrollTargetFor } from './scroll';

/** Hands a focused field's wrapper to the step's scroll view. */
type Reveal = (target: View | null) => void;

const RevealContext = createContext<Reveal>(() => undefined);

/**
 * For a field's `onFocus`: pass it the field's wrapping View and the step
 * scrolls it clear of the keyboard. A no-op outside a StepScroll.
 */
export function useRevealOnFocus(): Reveal {
  return useContext(RevealContext);
}

/**
 * The scrolling body for a step that has text fields low on the screen — the
 * ride step's nickname, the garage's typed make and model.
 *
 * Use it with `<OnboardingFrame scroll={false}>`, and give the heading to
 * StepHeading inside it rather than to the frame. The frame's own scroll view
 * cannot be reached from a step, and on a 375×667 phone the keyboard plus the
 * pinned Continue leave about 300pt of window: a field in the lower half of
 * the step was typed into blind. This scroll view keeps the focused field in
 * that window. The heading scrolls with the body so a heading grown by large
 * Dynamic Type can still be scrolled past, as it can in the frame.
 *
 * The keyboard's arrival is waited for (keyboardDidShow) before measuring:
 * only then has the screen's KeyboardAvoidingView handed its space over, so
 * the window measured is the window the person will see.
 */
export function StepScroll({
  children,
  contentStyle,
}: {
  children: React.ReactNode;
  contentStyle?: ViewStyle;
}) {
  const reduced = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const offset = useRef(0);
  const viewport = useRef(0);
  const pending = useRef<View | null>(null);

  const bringIntoView = useCallback(() => {
    const target = pending.current;
    const content = contentRef.current;
    if (!target || !content) return;
    target.measureLayout(
      content,
      (_x, y, _w, h) => {
        const next = scrollTargetFor({
          top: y,
          bottom: y + h,
          offset: offset.current,
          viewport: viewport.current,
          margin: space.lg,
        });
        if (next !== null) scrollRef.current?.scrollTo({ y: next, animated: !reduced });
      },
      () => undefined,
    );
  }, [reduced]);

  useEffect(() => {
    const subs = [
      // One frame later, so onLayout has reported the shrunken window.
      Keyboard.addListener('keyboardDidShow', () => requestAnimationFrame(bringIntoView)),
      Keyboard.addListener('keyboardDidHide', () => {
        pending.current = null;
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [bringIntoView]);

  const reveal = useCallback<Reveal>(
    (target) => {
      pending.current = target;
      // Focus moving between fields with the keyboard already up fires no
      // new keyboardDidShow on every platform, so measure now.
      if (Keyboard.isVisible()) requestAnimationFrame(bringIntoView);
    },
    [bringIntoView],
  );

  return (
    <RevealContext.Provider value={reveal}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        // Same reasoning as Screen: a tap on a control beside a focused field
        // acts on the first tap instead of only dismissing the keyboard.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        scrollEventThrottle={16}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
        }}
        onLayout={(e) => {
          viewport.current = e.nativeEvent.layout.height;
        }}
      >
        {/* Measured against, so a field's position is in content coordinates
            however deeply it is nested. */}
        <View ref={contentRef} style={[styles.inner, contentStyle]}>
          {children}
        </View>
      </ScrollView>
    </RevealContext.Provider>
  );
}

/**
 * A step's title and subtitle, for steps whose heading lives in a StepScroll.
 * The frame's own heading (StepTitle, the same component), at the frame's
 * spacing, so a step that scrolls its own heading sits exactly where one that
 * does not would.
 */
export function StepHeading({
  title,
  subtitle,
  centered = false,
}: {
  title: string;
  subtitle?: string;
  centered?: boolean;
}) {
  return <StepTitle title={title} subtitle={subtitle} centered={centered} style={styles.heading} />;
}

const styles = StyleSheet.create({
  // Runs under the footer's edge: the frame's non-scrolling body keeps
  // Screen's bottom padding, which would otherwise leave a dead band between
  // the last row and Continue. The padding moves inside the scroll instead.
  scroll: { flex: 1, marginBottom: -space.xxl },
  content: { flexGrow: 1, paddingBottom: space.xxl },
  inner: { flexGrow: 1, gap: space.md },
  // OnboardingFrame: heading marginTop xxl, body marginTop xl. The body's
  // own gap adds md, so the bottom margin makes up the difference.
  heading: { marginTop: space.xxl, marginBottom: space.xl - space.md },
});

import React from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { BottomSheet } from '@/components/BottomSheet';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { ProBadge } from '@/components/ProBadge';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import {
  alpha,
  color,
  font,
  glow,
  maxFontScale,
  radius,
  slant,
  space,
  textStyle,
  type,
} from '@/theme/tokens';
import { EDGE } from './layout';

/**
 * One choice in a board control. `detail` is a trailing note that must stay
 * readable however long the label runs — the class picker's driver count.
 * `pro` marks a row the account's plan does not open (src/board/bracketAccess.ts),
 * with an `accessibilityLabel` that says so; neither is set on an open row.
 */
export type Option<T extends string> = {
  key: T;
  label: string;
  detail?: string;
  pro?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * Text scale (iOS AX1 is ~1.79) above which the board's default layout stops
 * fitting a small phone; see LARGE_TEXT in app/(tabs)/board.tsx.
 */
export const LARGE_TEXT = 1.5;

/**
 * The metric tabs: plain labels, the active one white with a small red light
 * under it at the logo's slant (Nightrun-Ranks). A tab bar to VoiceOver.
 * Sizes to content inside a scroller, so at large text the fourth tab is a
 * swipe away rather than squeezed to an ellipsis.
 */
export function MetricTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}): React.JSX.Element {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabsScroll}
      contentContainerStyle={styles.tabs}
      accessibilityRole="tablist"
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <PressableScale
            key={o.key}
            silent
            onPress={() => {
              if (on) return;
              haptic.selection();
              onChange(o.key);
            }}
            accessibilityRole="tab"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityHint={o.accessibilityHint}
            accessibilityState={{ selected: on }}
            style={styles.tab}
          >
            <Text
              style={[styles.tabLabel, { color: on ? color.text1 : color.text3 }]}
              maxFontSizeMultiplier={maxFontScale.button}
              numberOfLines={1}
            >
              {o.label}
            </Text>
            {on ? <View style={styles.tabLight} /> : null}
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

/**
 * Slanted segments (World / Country / Friends): outlined plates, the chosen
 * one solid white with ink text. The plate leans; the label does not.
 */
export function Segments<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Dimmed and inert — a filter the board cannot honour must not look live. */
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.segments} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <PressableScale
            key={o.key}
            silent
            disabled={disabled}
            onPress={() => {
              if (on) return;
              haptic.selection();
              onChange(o.key);
            }}
            accessibilityRole="radio"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityState={{ checked: on, disabled: disabled === true }}
            style={[styles.seg, disabled === true && styles.off]}
          >
            <View pointerEvents="none" style={[styles.segPlate, on && styles.segPlateOn]} />
            <Text
              style={[styles.segLabel, { color: on ? color.onLight : color.text2 }]}
              maxFontSizeMultiplier={maxFontScale.chip}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/**
 * A dropdown chip on a slanted outline: the current value and a chevron
 * ("7 days ⌄", "All classes ⌄"). `pro` adds the PRO tag: the choices behind it
 * are Pro.
 */
export function DropChip({
  label,
  onPress,
  disabled,
  pro,
  mono,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  pro?: boolean;
  /** Set the value in mono, for a data-like value (a vehicle class). */
  mono?: boolean;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
  style?: React.ComponentProps<typeof View>['style'];
}): React.JSX.Element {
  return (
    <PressableScale
      silent
      disabled={disabled}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled === true }}
      style={[styles.seg, styles.chip, disabled === true && styles.off, style]}
    >
      <View pointerEvents="none" style={styles.segPlate} />
      <Text
        style={[styles.segLabel, mono && styles.chipMono, { color: color.text2 }]}
        maxFontSizeMultiplier={maxFontScale.chip}
        numberOfLines={1}
      >
        {label}
      </Text>
      {pro ? <ProBadge style={styles.centred} /> : null}
      <Icon name="chevronDown" size={14} color={color.text2} strokeWidth={2.2} />
    </PressableScale>
  );
}

/**
 * "Verified drives only", top right of the board: the real verified filter,
 * as a checkbox. A ticked circle when on; an empty one when off; dimmed and
 * inert on a board built from this device's drives, where nothing is verified
 * and the filter cannot apply.
 */
export function VerifiedToggle({
  on,
  disabled,
  onPress,
}: {
  on: boolean;
  disabled: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const ink = on ? color.text2 : color.text3;
  return (
    <PressableScale
      silent
      disabled={disabled}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityLabel="Verified drives only"
      accessibilityState={{ checked: on, disabled }}
      hitSlop={{ top: 2, bottom: 2 }}
      style={[styles.verified, disabled && styles.off]}
    >
      <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
        <Circle cx={7} cy={7} r={6} stroke={ink} strokeWidth={1.3} />
        {on ? (
          <Path
            d="M4.3 7.2l1.9 1.9 3.6-3.9"
            stroke={ink}
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </Svg>
      <Text variant="mono" style={{ color: ink }} maxFontSizeMultiplier={maxFontScale.chip}>
        Verified drives only
      </Text>
    </PressableScale>
  );
}

/** A mono link with a leading stroke icon and a chevron ("Manage friends ›"). */
export function BoardLink({
  icon,
  label,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}): React.JSX.Element {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={styles.link}
    >
      <Icon name={icon} size={16} color={color.text2} />
      <Text variant="mono" style={styles.linkLabel}>
        {label}
      </Text>
      <Icon name="chevronRight" size={14} color={color.text2} strokeWidth={2} />
    </PressableScale>
  );
}

/**
 * A picker in a bottom sheet: the period and the vehicle class. The chosen
 * row is white with a tick; the rest are soft. A Pro row is never the chosen
 * one, so its PRO tag takes the tick's place.
 */
export function OptionSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onSelect,
  onClose,
  onHidden,
}: {
  visible: boolean;
  title: string;
  options: Option<T>[];
  value: T;
  onSelect: (v: T) => void;
  onClose: () => void;
  onHidden?: () => void;
}): React.JSX.Element {
  // Past LARGE_TEXT a row's detail moves under its label. Beside it, the
  // driver count — which never shrinks — left the class name a few characters
  // a line at AX sizes on a small phone.
  const stacked = useWindowDimensions().fontScale >= LARGE_TEXT;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onHidden={onHidden}
      title={title}
      heightFraction={0.5}
    >
      {/* Scrolls, because the sheet is a fixed half-screen that clips: the
          class list has a row per class with drivers in it (up to sixty), and
          at accessibility text sizes even the four periods outgrow it. The
          sheet's drag-to-dismiss lives on its header, so the two gestures
          never compete. */}
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetBody}
        alwaysBounceVertical={false}
      >
        {options.map((o) => {
          const on = o.key === value;
          return (
            <PressableScale
              key={o.key}
              silent
              onPress={() => {
                haptic.selection();
                onSelect(o.key);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={o.accessibilityLabel}
              accessibilityState={{ selected: on }}
              style={styles.option}
            >
              <View style={stacked ? styles.optionTextStacked : styles.optionText}>
                {/* Two lines before an ellipsis: "All drivetrains · Stock · Open
                    class" is the commonest class and is wider than one line.
                    Stacked, nothing is cut: the sheet scrolls. */}
                <Text
                  variant="bodyMedium"
                  numberOfLines={stacked ? undefined : 2}
                  style={[
                    stacked ? null : styles.optionLabel,
                    { color: on ? color.text1 : color.text2 },
                  ]}
                >
                  {o.label}
                </Text>
                {o.detail ? (
                  <Text variant="mono" style={stacked ? null : styles.optionDetail}>
                    {o.detail}
                  </Text>
                ) : null}
              </View>
              {on ? (
                <Icon name="check" size={20} color={color.text1} strokeWidth={2.2} />
              ) : o.pro ? (
                <View style={styles.optionPro}>
                  <ProBadge />
                </View>
              ) : null}
            </PressableScale>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

/** The plates' inset inside their 44pt target (the mock's top/bottom 6). */
const PLATE_INSET = 6;

const styles = StyleSheet.create({
  off: { opacity: 0.45 },
  // Tags pin themselves to the start of their line; in a row, centre them.
  centred: { alignSelf: 'center' },
  tabsScroll: { flexGrow: 0 },
  tabs: { flexDirection: 'row', gap: 22, paddingHorizontal: EDGE },
  // The vertical padding keeps the light under the label, not across it, once
  // Dynamic Type has grown the label past the 44pt floor.
  tab: { minHeight: 44, justifyContent: 'center', paddingVertical: space.sm },
  tabLabel: { fontFamily: font.bodySemibold, ...textStyle(type.caption) },
  // A light: the one red thing on the control, so it may glow.
  tabLight: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 5,
    height: 3,
    borderRadius: 1,
    backgroundColor: color.accent,
    transform: slant.transform,
    boxShadow: `0 0 ${glow.tight}px 1px ${alpha(color.accent, 0.8)}`,
  },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  seg: {
    minHeight: 44,
    paddingHorizontal: 14,
    // Clears the plate's inset, so a label grown by Dynamic Type stays on
    // its plate rather than spilling past the top and bottom edges.
    paddingVertical: PLATE_INSET + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  segPlate: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PLATE_INSET,
    bottom: PLATE_INSET,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: color.hairline,
    transform: slant.transform,
  },
  segPlateOn: { backgroundColor: color.text1, borderColor: color.text1 },
  segLabel: { fontFamily: font.bodySemibold, ...textStyle(type.legal), flexShrink: 1 },
  chip: { paddingRight: space.md },
  chipMono: { fontFamily: font.mono, ...textStyle(type.mono) },
  verified: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: space.sm,
  },
  link: {
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  linkLabel: { color: color.text2 },
  sheetScroll: { flex: 1 },
  sheetBody: { paddingHorizontal: space.xl },
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  optionText: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minWidth: 0 },
  optionTextStacked: { flex: 1, minWidth: 0, gap: 2 },
  optionLabel: { flex: 1 },
  optionDetail: { flexShrink: 0 },
  optionPro: { marginLeft: space.sm },
});

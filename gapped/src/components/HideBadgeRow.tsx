import React from 'react';
import { StyleSheet, Switch, View, ViewStyle } from 'react-native';
import { Card } from '@/components/Card';
import { PressableScale } from '@/components/PressableScale';
import { ProBadge } from '@/components/ProBadge';
import { Text } from '@/components/Text';
import { proLabel } from '@/drive/driveAccess';
import { haptic } from '@/lib/haptics';
import { color, space } from '@/theme/tokens';

const LABEL = 'Hide Gapped badge';
const NOTE = 'The verification mark stays on the card either way.';

type Props = {
  /** The person asked for the GAPPED wordmark to come off the card. */
  hidden: boolean;
  onChange: (hidden: boolean) => void;
  /** Clean share cards are Pro and this account does not have them. */
  locked: boolean;
  onGoPro: () => void;
  style?: ViewStyle;
};

/**
 * "Hide Gapped badge" for the share card (PLAN_MATRIX 'cleanShareCards').
 *
 * The whole row is the control, not just the switch: a bare Switch is 31pt
 * tall, under the 44pt target, and the row is what the label belongs to.
 * The Switch is drawn for the eye and passes its touches to the row, so
 * VoiceOver meets one element, "Hide Gapped badge, switch, off". Locked, the
 * chip stands where the switch would and the row leads to Pro instead.
 */
export function HideBadgeRow({ hidden, onChange, locked, onGoPro, style }: Props) {
  return (
    <PressableScale
      onPress={
        locked
          ? onGoPro
          : () => {
              haptic.selection();
              onChange(!hidden);
            }
      }
      // A toggle fires its own selection tick; the generic press would be
      // swallowed by the throttle anyway.
      silent={!locked}
      accessibilityRole={locked ? 'button' : 'switch'}
      accessibilityLabel={locked ? proLabel(LABEL) : LABEL}
      // The label replaces the row's text for VoiceOver, so the note under
      // it would otherwise go unheard.
      accessibilityHint={NOTE}
      accessibilityState={locked ? undefined : { checked: hidden }}
      style={style}
    >
      <Card style={styles.card}>
        <View style={styles.text}>
          <Text variant="bodyMedium">{LABEL}</Text>
          <Text variant="legal">{NOTE}</Text>
        </View>
        {locked ? (
          // Wrapped: the chip pins itself to the top of a row, and this one
          // should sit centred where the switch would.
          <View>
            <ProBadge />
          </View>
        ) : (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Switch
              value={hidden}
              trackColor={{ true: color.accent, false: color.surface3 }}
              thumbColor={color.text1}
            />
          </View>
        )}
      </Card>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: { flex: 1, gap: 2 },
});

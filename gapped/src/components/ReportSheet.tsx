import React, { useState } from 'react';
import {
  AccessibilityInfo,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/Button';
import { PressableScale } from '@/components/PressableScale';
import { Text } from '@/components/Text';
import { haptic } from '@/lib/haptics';
import {
  HIDDEN_CONFIRMATION,
  hideDriver,
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  REPORTED_CONFIRMATION,
  reportDriver,
  type ReportReason,
} from '@/social/moderation';
import { color, glyph as glyphSize, radius, space, textStyle, type } from '@/theme/tokens';

/** The driver a report or a hide is about. */
export type ReportTarget = { profileId: string; username: string };

type Props = {
  /** The driver the sheet acts on. Null closes it. */
  target: ReportTarget | null;
  onClose: () => void;
  /**
   * Called once a hide has gone through, with the driver's id, so the screen
   * can take them off what it shows straight away — the server leaves them
   * off from the next fetch on.
   */
  onDriverHidden: (profileId: string) => void;
  /** What hiding does on this screen, under the Hide action. */
  hideDetail?: string;
};

const DEFAULT_HIDE_DETAIL =
  "They disappear from every board you see. Undo it in Settings, under Hidden drivers.";

/**
 * "Report driver" and "Hide this driver", for anyone else's row on a board or
 * in Friends (App Review guideline 1.2: a way to report content and to block
 * the person behind it).
 *
 * One sheet with three steps — the two actions, the report form, and a
 * confirmation — rather than an action sheet leading to a form leading to an
 * alert: each step replaces the last in place, so there is never a Modal to
 * wait out before the next can open. Every outcome is said in words, and a
 * failure leaves the person where they were with the reason under the action.
 */
export function ReportSheet({
  target,
  onClose,
  onDriverHidden,
  hideDetail = DEFAULT_HIDE_DETAIL,
}: Props): React.JSX.Element {
  // The sheet animates out after `target` goes null, so it keeps drawing the
  // driver it was opened for. `opened` counts openings: the body is keyed on
  // it, so every opening starts on the first step with an empty form, even
  // for the same driver twice running.
  const [shown, setShown] = useState<ReportTarget | null>(target);
  const [opened, setOpened] = useState(0);
  const [previous, setPrevious] = useState<ReportTarget | null>(target);
  if (target !== previous) {
    setPrevious(target);
    if (target) {
      setShown(target);
      setOpened((n) => n + 1);
    }
  }

  return (
    <BottomSheet
      visible={target != null}
      onClose={onClose}
      title={shown ? `@${shown.username}` : ''}
      heightFraction={0.78}
    >
      {shown ? (
        <ReportBody
          key={opened}
          target={shown}
          onClose={onClose}
          onDriverHidden={onDriverHidden}
          hideDetail={hideDetail}
        />
      ) : null}
    </BottomSheet>
  );
}

type Step = 'menu' | 'report' | 'reported' | 'hidden';

function ReportBody({
  target,
  onClose,
  onDriverHidden,
  hideDetail,
}: {
  target: ReportTarget;
  onClose: () => void;
  onDriverHidden: (profileId: string) => void;
  hideDetail: string;
}): React.JSX.Element {
  const [step, setStep] = useState<Step>('menu');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState<'report' | 'hide' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = `@${target.username}`;

  const settle = (next: Step, line: string) => {
    haptic.selection();
    setStep(next);
    AccessibilityInfo.announceForAccessibility(line);
  };
  const failed = (message: string) => {
    haptic.error();
    setError(message);
    AccessibilityInfo.announceForAccessibility(message);
  };

  const hide = async () => {
    if (busy) return;
    setBusy('hide');
    setError(null);
    const result = await hideDriver(target.profileId);
    setBusy(null);
    if (!result.ok) return failed(result.message);
    onDriverHidden(target.profileId);
    settle('hidden', HIDDEN_CONFIRMATION);
  };

  const send = async () => {
    if (busy || reason == null) return;
    setBusy('report');
    setError(null);
    const result = await reportDriver(target.profileId, reason, details);
    setBusy(null);
    if (!result.ok) return failed(result.message);
    settle('reported', REPORTED_CONFIRMATION);
  };

  const errorLine = error ? (
    <Text variant="caption" style={styles.error} accessibilityLiveRegion="polite">
      {error}
    </Text>
  ) : null;

  if (step === 'reported' || step === 'hidden') {
    return (
      <Steps>
        <Text variant="bodyMedium" accessibilityRole="header">
          {step === 'reported' ? REPORTED_CONFIRMATION : HIDDEN_CONFIRMATION}
        </Text>
        {step === 'reported' ? (
          <Button
            label={busy === 'hide' ? 'Hiding…' : `Hide ${name} too`}
            variant="secondary"
            onPress={hide}
            disabled={busy != null}
            style={styles.gap}
          />
        ) : null}
        {errorLine}
        <Button label="Done" onPress={onClose} style={styles.gap} />
      </Steps>
    );
  }

  if (step === 'report') {
    return (
      <Steps>
        <Text variant="body">Why are you reporting {name}?</Text>
        <View accessibilityRole="radiogroup" style={styles.reasons}>
          {REPORT_REASONS.map((r) => {
            const selected = r.key === reason;
            return (
              <PressableScale
                key={r.key}
                silent
                onPress={() => {
                  haptic.selection();
                  setReason(r.key);
                  setError(null);
                }}
                accessibilityRole="radio"
                accessibilityLabel={r.label}
                accessibilityState={{ checked: selected }}
                style={styles.reason}
              >
                <View style={[styles.radio, selected && styles.radioOn]}>
                  {selected ? <View style={styles.radioDot} /> : null}
                </View>
                <Text
                  variant="bodyMedium"
                  style={[styles.reasonLabel, selected && { color: color.accent }]}
                >
                  {r.label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder="Anything that would help us check (optional)"
          placeholderTextColor={color.text2}
          multiline
          maxLength={REPORT_DETAILS_MAX}
          editable={busy == null}
          style={styles.details}
          accessibilityLabel="Details, optional"
          accessibilityHint={`Up to ${REPORT_DETAILS_MAX} characters.`}
        />
        <Text variant="legal" style={styles.counter}>
          {details.length}/{REPORT_DETAILS_MAX}
        </Text>
        {errorLine}
        <Button
          label={busy === 'report' ? 'Sending…' : 'Send report'}
          onPress={send}
          disabled={reason == null || busy != null}
          style={styles.gap}
        />
        <Button
          label="Back"
          variant="secondary"
          onPress={() => {
            setError(null);
            setStep('menu');
          }}
          disabled={busy != null}
          style={styles.gap}
        />
      </Steps>
    );
  }

  return (
    <Steps>
      <Action
        label="Report driver"
        detail="An offensive name, a spoofed run, or someone pretending to be someone else. We review reports within 24 hours."
        onPress={() => {
          setError(null);
          setStep('report');
        }}
        disabled={busy != null}
      />
      <Action
        label={busy === 'hide' ? 'Hiding…' : 'Hide this driver'}
        detail={hideDetail}
        onPress={hide}
        disabled={busy != null}
      />
      {errorLine}
    </Steps>
  );
}

/**
 * Every step scrolls: the sheet is a fixed height, and at the largest text
 * sizes even the two actions outgrow it. The scroll view also insets itself by
 * the keyboard, which rises over the report form's details field and Send.
 */
function Steps({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      alwaysBounceVertical={false}
    >
      {children}
    </ScrollView>
  );
}

/** One of the sheet's two actions: a label, and what it does underneath. */
function Action({
  label,
  detail,
  onPress,
  disabled,
}: {
  label: string;
  detail: string;
  onPress: () => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ disabled }}
      style={[styles.action, disabled && styles.dimmed]}
    >
      <View style={styles.actionText}>
        <Text variant="bodyMedium">{label}</Text>
        <Text variant="caption">{detail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xl, gap: space.md },
  gap: { marginTop: space.xs },
  error: { color: color.danger },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  actionText: { flex: 1, gap: 2, minWidth: 0 },
  chevron: { ...textStyle(glyphSize.xxl), color: color.text3 },
  dimmed: { opacity: 0.45 },
  reasons: { gap: space.xs },
  // 52pt rows: the radio and its label are one target, above the 44pt floor.
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: color.text3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: color.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.accent },
  reasonLabel: { flex: 1 },
  details: {
    minHeight: 96,
    maxHeight: 160,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderRadius: radius.card,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.hairline,
    color: color.text1,
    textAlignVertical: 'top',
    ...textStyle(type.body),
  },
  counter: { textAlign: 'right' },
});

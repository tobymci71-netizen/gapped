import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { SectionHeader } from '@/components/brand/SectionHeader';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/PressableScale';
import { ProBadge, useGoPro } from '@/components/ProBadge';
import { ReportSheet, type ReportTarget } from '@/components/ReportSheet';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { formatSpeed } from '@/drive/units';
import { useAccess } from '@/lib/entitlements';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { friendAdd } from '@/social/friendLimit';
import {
  addFriend,
  Friend,
  type FriendsResult,
  listFriends,
  removeFriend,
} from '@/social/friends';
import { useProfile } from '@/state/profile';
import { color, font, radius, space, type, textStyle } from '@/theme/tokens';

/**
 * What hiding a friend does here: the Hide also unfollows them, so a driver
 * you hid does not sit on your friends list, counted and invisible.
 */
const HIDE_FRIEND_DETAIL =
  "They're removed from your friends and disappear from every board you see. Unhide them in Settings, under Hidden drivers.";

/** The add field and its button share one height, so the pair reads as one control. */
const FIELD_HEIGHT = 56;

/**
 * Friends screen.
 *
 * Following, not mutual: adding someone puts them on your board and does
 * nothing to theirs. The copy says so plainly rather than implying a request
 * was sent that the other person will see.
 */
export default function FriendsScreen() {
  const router = useRouter();
  // A cold-start deep link (gapped://friends, gapped://drive/<id>) opens this
  // screen with nothing beneath it, so Back must have somewhere to go.
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/drive'));
  const unitPref = useProfile((s) => s.unitPref);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const access = useAccess();
  const goPro = useGoPro();
  // Free follows up to FREE_LIMITS.friends (src/social/friendLimit.ts). A list
  // that is loading or failed to load is not a count, so it locks nothing.
  // Only adding is limited: everyone already followed stays listed below and
  // on the friends board.
  const add = friendAdd(friends === null || loadError ? null : friends.length, access);

  const show = useCallback((result: FriendsResult) => {
    if (result.ok) {
      setFriends(result.friends);
      setLoadError(null);
    } else {
      // Distinct from the empty state: "we could not ask" is not "you have none".
      setFriends([]);
      setLoadError(result.reason);
    }
  }, []);
  const refresh = useCallback(() => listFriends().then(show), [show]);

  // The first load, as Hidden drivers does it: an answer that arrives after
  // the screen has gone is dropped rather than set on an unmounted screen.
  useEffect(() => {
    let live = true;
    void listFriends().then((result) => {
      if (live) show(result);
    });
    return () => {
      live = false;
    };
  }, [show]);

  const onAdd = async () => {
    setBusy(true);
    setError(null);
    const result = await addFriend(name);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      haptic.error();
      return;
    }
    haptic.selection();
    setName('');
    refresh();
  };

  const onRemove = (friend: Friend) => {
    Alert.alert(`Remove ${friend.username}?`, 'They drop off your friends board.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        // Feedback follows the outcome rather than the tap. A press haptic
        // fired before the request read as success, and a failure (offline,
        // expired session) then closed the alert onto an unchanged list with
        // nothing to say the removal had not happened.
        onPress: async () => {
          if (await removeFriend(friend.friendId)) {
            haptic.selection();
            refresh();
            return;
          }
          haptic.error();
          Alert.alert(
            `Could not remove ${friend.username}`,
            'Check your connection and try again.',
          );
        },
      },
    ]);
  };

  // Hidden from the sheet: off the list at once, then unfollowed. The server
  // already leaves a hidden driver out of list_friends, so the refresh agrees
  // whether or not the unfollow got through; if it did not, the follow simply
  // comes back with them should they ever be unhidden.
  const onDriverHidden = (friendId: string) => {
    setFriends((list) => (list ? list.filter((f) => f.friendId !== friendId) : list));
    void removeFriend(friendId)
      .catch(() => false)
      .then(() => refresh());
  };

  // Without a backend there is no one to follow. Say that, rather than showing
  // an input that silently cannot work.
  if (!supabase) {
    return (
      <Screen footer={<Button label="Back" variant="secondary" onPress={goBack} />}>
        <Text variant="headline" accessibilityRole="header">
          Friends
        </Text>
        <View style={styles.state}>
          <Icon name="friends" size={28} color={color.text3} />
          <Text variant="callout">
            Friends need an account. Your drives are recording locally and will sync when one is
            connected.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label="Back" variant="secondary" onPress={goBack} />}>
      <Text variant="headline" accessibilityRole="header">
        Friends
      </Text>
      <Text variant="callout" style={styles.sub}>
        Add someone by username and their verified runs join your friends board. They are not
        notified, and your board is not added to theirs.
      </Text>

      {add.kind === 'locked' ? (
        // In place of the field, not a field that refuses: a disabled input
        // gives no reason, and the reason is the useful part.
        <PressableScale
          onPress={goPro}
          accessibilityRole="button"
          accessibilityLabel={add.accessibilityLabel}
          accessibilityHint="Shows what Gapped Pro adds."
          style={styles.addCard}
        >
          <Card style={styles.locked}>
            <ProBadge />
            <Text variant="callout">{add.line}</Text>
            <View style={styles.lockedLink}>
              <Text variant="mono" style={styles.lockedLinkText}>
                See Gapped Pro
              </Text>
              <Icon name="chevronRight" size={14} color={color.text1} strokeWidth={2} />
            </View>
          </Card>
        </PressableScale>
      ) : (
        <View style={styles.addCard}>
          <View style={styles.row}>
            <View style={styles.field}>
              {/* The field's own label says what goes in it; a lone "at sign"
                  stop before it would only be noise to VoiceOver. */}
              <Text
                variant="mono"
                style={styles.at}
                accessibilityElementsHidden
                importantForAccessibility="no"
              >
                @
              </Text>
              <TextInput
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  setError(null);
                }}
                placeholder="username"
                placeholderTextColor={color.text3}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={onAdd}
                editable={!busy}
                style={styles.input}
                accessibilityLabel="Friend's username"
              />
            </View>
            {/* A routine add: the white plate, not the red one. */}
            <Button
              label={busy ? 'Adding…' : 'Add'}
              variant="light"
              onPress={onAdd}
              disabled={busy || !name.trim()}
              style={styles.addBtn}
            />
          </View>
          {error ? (
            <Text variant="caption" style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </View>
      )}

      {friends === null ? (
        <View style={styles.loading}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={styles.loadingRow} />
          ))}
        </View>
      ) : loadError ? (
        <View style={styles.state}>
          <Icon name="friends" size={28} color={color.text3} />
          <Text variant="cardTitle" accessibilityRole="header">
            Could not load friends
          </Text>
          <Text variant="callout">{loadError}</Text>
          <Button
            label="Try again"
            variant="secondary"
            onPress={refresh}
            style={styles.retry}
          />
        </View>
      ) : friends.length === 0 ? (
        <View style={styles.state}>
          <Icon name="friends" size={28} color={color.text3} />
          <Text variant="cardTitle" accessibilityRole="header">
            No friends yet
          </Text>
          <Text variant="callout">
            Your friends board stays empty until you add someone. Nothing is invented to fill it.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          <SectionHeader title="Following" />
          {friends.map((f) => (
            // The name is the long-press target and the '⋯' its own button,
            // side by side rather than one inside the other: a pressable row
            // read as a single element to VoiceOver, which hid the button.
            <View key={f.friendId} style={styles.friend}>
              <PressableScale
                onLongPress={() => onRemove(f)}
                accessibilityRole="button"
                accessibilityLabel={`${f.username}. Long press to remove.`}
                style={styles.friendMain}
              >
                <Text variant="bodySemibold" numberOfLines={1}>
                  {f.username}
                </Text>
                <Text variant="mono">
                  {f.bestSpeedMs != null
                    ? `Best ${formatSpeed(f.bestSpeedMs, unitPref)}`
                    : 'No verified runs yet'}
                </Text>
              </PressableScale>
              {f.country ? <Text variant="mono">{f.country}</Text> : null}
              <PressableScale
                silent
                onPress={() => {
                  haptic.selection();
                  setReportTarget({ profileId: f.friendId, username: f.username });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Report or hide ${f.username}`}
                style={styles.more}
              >
                <Icon name="more" size={20} color={color.text3} />
              </PressableScale>
            </View>
          ))}
        </View>
      )}

      {friends && friends.length > 0 ? (
        <Text variant="legal" style={styles.hint}>
          Long-press a friend to remove them. Tap ⋯ to report or hide them.
        </Text>
      ) : null}

      <ReportSheet
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onDriverHidden={onDriverHidden}
        hideDetail={HIDE_FRIEND_DETAIL}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: space.sm },
  addCard: { marginTop: space.xl },
  // The card is the press target, and its padding alone clears 44pt. Its
  // margin (addCard) sits on the pressable, outside the target, so a tap in
  // the gap under the intro copy does not open Gapped Pro.
  locked: { gap: space.sm },
  // A lock is not a light: white, never red.
  lockedLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  lockedLinkText: { color: color.text1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  field: {
    flex: 1,
    minHeight: FIELD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  at: { color: color.text3 },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    color: color.text1,
    fontFamily: font.body,
    ...textStyle(type.body),
  },
  // Wide enough for "Adding…" at default text size, so swapping the label
  // mid-request changes neither the width nor the height; at 96 the busy label
  // broke mid-word onto a second line. minWidth, not width, so at larger text
  // sizes the plate grows instead of wrapping. Not stretched: it sits beside
  // the field.
  addBtn: { minWidth: 112, alignSelf: 'auto', minHeight: FIELD_HEIGHT },
  error: { marginTop: space.md, color: color.danger },
  loading: { marginTop: space.xl, gap: space.md },
  loadingRow: { height: 56, borderRadius: radius.sm },
  retry: { marginTop: space.md, alignSelf: 'flex-start' },
  // Empty, failed and no-account states: open on the night, not boxed.
  state: { marginTop: space.xl, gap: space.sm },
  list: {
    marginTop: space.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.divider,
  },
  friend: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.divider,
  },
  friendMain: { flex: 1, gap: 2, minWidth: 0, paddingVertical: space.md },
  more: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: space.lg },
});

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PressableScale } from '@/components/PressableScale';
import { Screen } from '@/components/Screen';
import { Skeleton } from '@/components/Skeleton';
import { Text } from '@/components/Text';
import { formatSpeed } from '@/drive/units';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { addFriend, Friend, listFriends, removeFriend } from '@/social/friends';
import { useProfile } from '@/state/profile';
import { color, radius, space, type } from '@/theme/tokens';

/**
 * Friends screen.
 *
 * Following, not mutual: adding someone puts them on your board and does
 * nothing to theirs. The copy says so plainly rather than implying a request
 * was sent that the other person will see.
 */
export default function FriendsScreen() {
  const router = useRouter();
  const unitPref = useProfile((s) => s.unitPref);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listFriends();
    if (result.ok) {
      setFriends(result.friends);
      setLoadError(null);
    } else {
      // Distinct from the empty state: "we could not ask" is not "you have none".
      setFriends([]);
      setLoadError(result.reason);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        onPress: async () => {
          haptic.press();
          if (await removeFriend(friend.friendId)) refresh();
        },
      },
    ]);
  };

  // Without a backend there is no one to follow. Say that, rather than showing
  // an input that silently cannot work.
  if (!supabase) {
    return (
      <Screen footer={<Button label="Back" variant="secondary" onPress={() => router.back()} />}>
        <Text variant="headline">Friends</Text>
        <Card style={styles.note}>
          <Text variant="body">
            Friends need an account. Your drives are recording locally and will sync when one is
            connected.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label="Back" variant="secondary" onPress={() => router.back()} />}>
      <Text variant="headline">Friends</Text>
      <Text variant="body" style={styles.sub}>
        Add someone by username and their verified runs join your friends board. They are not
        notified, and your board is not added to theirs.
      </Text>

      <Card style={styles.addCard}>
        <View style={styles.row}>
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
          <Button label={busy ? 'Adding…' : 'Add'} onPress={onAdd} disabled={busy || !name.trim()} style={styles.addBtn} />
        </View>
        {error ? (
          <Text variant="caption" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </Card>

      {friends === null ? (
        <View style={styles.loading}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={styles.loadingRow} />
          ))}
        </View>
      ) : loadError ? (
        <Card style={styles.note}>
          <Text variant="cardTitle">Could not load friends</Text>
          <Text variant="body" style={styles.noteBody}>
            {loadError}
          </Text>
          <Button label="Try again" variant="secondary" onPress={refresh} style={styles.retry} />
        </Card>
      ) : friends.length === 0 ? (
        <Card style={styles.note}>
          <Text variant="cardTitle">No friends yet</Text>
          <Text variant="body" style={styles.noteBody}>
            Your friends board stays empty until you add someone. Nothing is invented to fill it.
          </Text>
        </Card>
      ) : (
        friends.map((f) => (
          <PressableScale
            key={f.friendId}
            onLongPress={() => onRemove(f)}
            accessibilityRole="button"
            accessibilityLabel={`${f.username}. Long press to remove.`}
          >
            <Card style={styles.friend}>
              <View style={styles.friendMain}>
                <Text variant="cardTitle" numberOfLines={1}>
                  {f.username}
                </Text>
                <Text variant="caption">
                  {f.bestSpeedMs != null
                    ? `Best ${formatSpeed(f.bestSpeedMs, unitPref)}`
                    : 'No verified runs yet'}
                </Text>
              </View>
              {f.country ? <Text variant="caption">{f.country}</Text> : null}
            </Card>
          </PressableScale>
        ))
      )}

      {friends && friends.length > 0 ? (
        <Text variant="legal" style={styles.hint}>
          Long-press a friend to remove them.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: space.sm },
  addCard: { marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  input: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.hairline,
    color: color.text1,
    fontSize: type.body,
  },
  addBtn: { width: 96 },
  error: { marginTop: space.md, color: color.danger },
  loading: { marginTop: space.lg, gap: space.md },
  loadingRow: { height: 72, borderRadius: radius.card },
  retry: { marginTop: space.md },
  note: { marginTop: space.lg },
  noteBody: { marginTop: space.sm },
  friend: {
    marginTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  friendMain: { flex: 1, gap: space.xs, minWidth: 0 },
  hint: { marginTop: space.lg, textAlign: 'center' },
});

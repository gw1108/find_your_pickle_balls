// Bottom-sheet of per-user actions (Phase 2, §5/§8): Message (DM), Report,
// Block. Android's Alert caps at 3 buttons, so this is a Modal.
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { blockUser, getOrCreateDm, reportTarget } from '@/lib/queries';

export type UserActionsTarget = { id: string; name: string };

type Props = {
  target: UserActionsTarget | null;
  onClose: () => void;
  /** Called after a successful block so the parent can refetch. */
  onBlocked?: () => void;
};

export function UserActionsSheet({ target, onClose, onBlocked }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session!.user.id;
  const [busy, setBusy] = useState(false);

  if (!target) return null;

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      Alert.alert('Something went wrong', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const message = () =>
    run(async () => {
      const channelId = await getOrCreateDm(target.id);
      onClose();
      router.push({ pathname: '/chat/[id]', params: { id: channelId } });
    });

  const report = () =>
    run(async () => {
      await reportTarget(userId, 'user', target.id, 'Reported from profile actions');
      onClose();
      Alert.alert('Reported', 'Our team reviews reports within 24 hours.');
    });

  const block = () => {
    Alert.alert(
      `Block ${target.name}?`,
      'You will no longer see each other anywhere in the app. You can unblock from your profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () =>
            run(async () => {
              await blockUser(userId, target.id);
              onClose();
              onBlocked?.();
            }),
        },
      ]
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.background }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="smallBold" style={styles.title}>
            {target.name}
          </ThemedText>
          <Pressable accessibilityRole="button" disabled={busy} onPress={message} style={styles.row}>
            <ThemedText>Message</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={report} style={styles.row}>
            <ThemedText>Report</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={block} style={styles.row}>
            <ThemedText style={{ color: theme.danger }}>Block</ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.row}>
            <ThemedText themeColor="textSecondary">Cancel</ThemedText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.one,
  },
  title: { marginBottom: Spacing.two },
  row: { paddingVertical: Spacing.three },
});

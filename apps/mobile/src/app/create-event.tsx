import type { LatLng, SkillLevel, Sport } from '@pickup/shared';
import { SKILL_LEVELS, SPORTS } from '@pickup/shared';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chips';
import { errorMessage } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { formatDistance, SKILL_LABEL, SPORT_EMOJI, SPORT_LABEL } from '@/lib/format';
import { createEvent, fetchVenuesNear, type NearbyVenue } from '@/lib/queries';

const AUSTIN: LatLng = { lat: 30.2672, lng: -97.7431 };

const DAY_OPTIONS = [
  { label: 'Today', offset: 0 },
  { label: 'Tomorrow', offset: 1 },
  { label: 'In 2 days', offset: 2 },
] as const;

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 6am–9pm

function hourLabel(h: number): string {
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

export default function CreateEventScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  // map center handed over by the map screen's FAB — games are created where
  // the user is browsing, not where GPS thinks the device is
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const paramCenter: LatLng | null =
    params.lat && params.lng && Number.isFinite(Number(params.lat))
      ? { lat: Number(params.lat), lng: Number(params.lng) }
      : null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sport, setSport] = useState<Sport>('pickleball');
  const [skillMin, setSkillMin] = useState<SkillLevel | null>(null);
  const [skillMax, setSkillMax] = useState<SkillLevel | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [hour, setHour] = useState(18);
  const [playerCap, setPlayerCap] = useState('4');
  const [here, setHere] = useState<LatLng>(AUSTIN);
  const [venues, setVenues] = useState<NearbyVenue[]>([]);
  const [venue, setVenue] = useState<NearbyVenue | null>(null);
  const [usePin, setUsePin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      let center = paramCenter ?? AUSTIN;
      if (!paramCenter) {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          }
        } catch {
          // keep fallback
        }
      }
      setHere(center);
      try {
        setVenues(await fetchVenuesNear(center, { sport }));
      } catch {
        setVenues([]);
      }
    })();
    // paramCenter is derived from route params — stable for the screen's life
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  const submit = async () => {
    if (title.trim().length < 3) {
      Alert.alert('Add a title', 'Give your game a short title (at least 3 characters).');
      return;
    }
    if (!venue && !usePin) {
      Alert.alert('Pick a spot', 'Choose a venue, or drop a pin at the map location.');
      return;
    }
    const cap = playerCap.trim() ? Number(playerCap) : null;
    if (cap !== null && (!Number.isInteger(cap) || cap < 2 || cap > 500)) {
      Alert.alert('Invalid player cap', 'Use a number between 2 and 500, or leave it empty.');
      return;
    }
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + dayOffset);
    startsAt.setHours(hour, 0, 0, 0);
    if (startsAt.getTime() < Date.now()) {
      Alert.alert('Time has passed', 'Pick a start time in the future.');
      return;
    }

    setBusy(true);
    try {
      const eventId = await createEvent({
        hostId: session!.user.id,
        title: title.trim(),
        description: description.trim(),
        sport,
        skillMin,
        skillMax,
        venueId: venue?.id ?? null,
        location: venue ? { lat: venue.lat, lng: venue.lng } : here,
        startsAt,
        playerCap: cap,
      });
      router.dismiss();
      router.push({ pathname: '/event/[id]', params: { id: eventId } });
    } catch (e) {
      Alert.alert('Could not create event', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="smallBold">Sport</ThemedText>
        <View style={styles.row}>
          {SPORTS.map((s) => (
            <Chip
              key={s}
              label={`${SPORT_EMOJI[s]} ${SPORT_LABEL[s]}`}
              selected={sport === s}
              onPress={() => {
                setSport(s);
                setVenue(null);
              }}
            />
          ))}
        </View>

        <ThemedText type="smallBold">Title</ThemedText>
        <TextInput
          placeholder="Tuesday open play"
          placeholderTextColor={theme.textSecondary}
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        <ThemedText type="smallBold">When</ThemedText>
        <View style={styles.row}>
          {DAY_OPTIONS.map((d) => (
            <Chip
              key={d.offset}
              label={d.label}
              selected={dayOffset === d.offset}
              onPress={() => setDayOffset(d.offset)}
            />
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.row}>
            {HOURS.map((h) => (
              <Chip
                key={h}
                label={hourLabel(h)}
                selected={hour === h}
                onPress={() => setHour(h)}
              />
            ))}
          </View>
        </ScrollView>

        <ThemedText type="smallBold">Where</ThemedText>
        <View style={styles.venueList}>
          <Chip
            label="📍 Drop pin at map location"
            selected={usePin}
            onPress={() => {
              setUsePin(true);
              setVenue(null);
            }}
          />
          {venues.slice(0, 8).map((v) => (
            <Chip
              key={v.id}
              label={`${v.name} · ${formatDistance(v.distance_m)}`}
              selected={venue?.id === v.id}
              onPress={() => {
                setVenue(v);
                setUsePin(false);
              }}
            />
          ))}
          {venues.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              No venues near here yet — drop a pin instead.
            </ThemedText>
          )}
        </View>

        <ThemedText type="smallBold">Skill range (optional)</ThemedText>
        <View style={styles.row}>
          {SKILL_LEVELS.map((lvl) => (
            <Chip
              key={lvl}
              label={SKILL_LABEL[lvl]}
              selected={
                skillMin !== null &&
                skillMax !== null &&
                SKILL_LEVELS.indexOf(lvl) >= SKILL_LEVELS.indexOf(skillMin) &&
                SKILL_LEVELS.indexOf(lvl) <= SKILL_LEVELS.indexOf(skillMax)
              }
              onPress={() => {
                // first tap sets both ends; second tap extends the range
                if (skillMin === null || skillMax === null) {
                  setSkillMin(lvl);
                  setSkillMax(lvl);
                } else if (lvl === skillMin && lvl === skillMax) {
                  setSkillMin(null);
                  setSkillMax(null);
                } else if (SKILL_LEVELS.indexOf(lvl) < SKILL_LEVELS.indexOf(skillMin)) {
                  setSkillMin(lvl);
                } else {
                  setSkillMax(lvl);
                }
              }}
            />
          ))}
        </View>

        <ThemedText type="smallBold">Player cap (optional)</ThemedText>
        <TextInput
          placeholder="e.g. 4 for doubles"
          placeholderTextColor={theme.textSecondary}
          value={playerCap}
          onChangeText={setPlayerCap}
          keyboardType="number-pad"
          maxLength={3}
          style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
        />

        <ThemedText type="smallBold">Details (optional)</ThemedText>
        <TextInput
          placeholder="Bring water, courts 3–4, all welcome"
          placeholderTextColor={theme.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={2000}
          style={[
            styles.input,
            styles.multiline,
            { color: theme.text, borderColor: theme.backgroundSelected },
          ]}
        />

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={submit}
          style={[styles.button, { backgroundColor: theme.text }]}>
          <ThemedText style={{ color: theme.background }}>
            {busy ? 'Creating…' : 'Create game'}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  venueList: { gap: Spacing.two, alignItems: 'flex-start' },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
});

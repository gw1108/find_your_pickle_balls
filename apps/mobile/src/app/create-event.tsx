import type { EventSport, LatLng, SkillLevel } from '@pickup/shared';
import { EVENT_SPORTS, OTHER_SPORT_SUGGESTIONS, SKILL_LEVELS } from '@pickup/shared';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chips';
import { DateTimeField } from '@/components/date-time-field';
import { errorMessage , formatDistance, SKILL_LABEL, SPORT_EMOJI, SPORT_LABEL } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { createEvent, fetchVenuesNear, type NearbyVenue } from '@/lib/queries';

const AUSTIN: LatLng = { lat: 30.2672, lng: -97.7431 };

// 6 PM today, or tomorrow once that has already passed
function defaultStart(): Date {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d;
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
  const [sport, setSport] = useState<EventSport>('pickleball');
  const [otherLabel, setOtherLabel] = useState('');
  const [skillMin, setSkillMin] = useState<SkillLevel | null>(null);
  const [skillMax, setSkillMax] = useState<SkillLevel | null>(null);
  const [startsAt, setStartsAt] = useState(defaultStart);
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
      if (sport === 'other') {
        setVenues([]);
        return;
      }
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
    if (sport === 'other' && otherLabel.trim().length === 0) {
      Alert.alert('Name the sport', 'Name the sport when choosing Other.');
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
        sportOtherLabel: sport === 'other' ? otherLabel.trim() : null,
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
          {EVENT_SPORTS.map((s) => (
            <Chip
              key={s}
              label={`${SPORT_EMOJI[s]} ${SPORT_LABEL[s]}`}
              selected={sport === s}
              onPress={() => {
                setSport(s);
                setVenue(null);
                if (s === 'other') setUsePin(true);
              }}
            />
          ))}
        </View>

        {sport === 'other' && (
          <>
            <TextInput
              placeholder="What sport? e.g. Spikeball"
              placeholderTextColor={theme.textSecondary}
              value={otherLabel}
              onChangeText={setOtherLabel}
              maxLength={40}
              style={[styles.input, { color: theme.text, borderColor: theme.backgroundSelected }]}
            />
            <View style={styles.row}>
              {OTHER_SPORT_SUGGESTIONS.filter(
                (s) =>
                  s.toLowerCase().includes(otherLabel.trim().toLowerCase()) &&
                  s.toLowerCase() !== otherLabel.trim().toLowerCase()
              ).map((s) => (
                <Chip key={s} label={s} selected={false} onPress={() => setOtherLabel(s)} />
              ))}
            </View>
          </>
        )}

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
          <DateTimeField
            mode="date"
            value={startsAt}
            minimumDate={new Date()}
            onChange={(d) =>
              setStartsAt((prev) => {
                const next = new Date(prev);
                next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                return next;
              })
            }
          />
          <DateTimeField
            mode="time"
            value={startsAt}
            onChange={(d) =>
              setStartsAt((prev) => {
                const next = new Date(prev);
                next.setHours(d.getHours(), d.getMinutes(), 0, 0);
                return next;
              })
            }
          />
        </View>

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
          {venues.length === 0 && sport !== 'other' && (
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

import Ionicons from '@expo/vector-icons/Ionicons';
import { Camera, Map, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import type { LatLng, SkillLevel, Sport } from '@pickup/shared';
import { SPORTS } from '@pickup/shared';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, SkillChips } from '@/components/chips';
import { EventCard } from '@/components/event-card';
import { errorMessage , SPORT_EMOJI, SPORT_LABEL } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchEventsNear, type NearbyEvent } from '@/lib/queries';

const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL || 'https://demotiles.maplibre.org/style.json';

/** Launch metro fallback until location permission resolves (PLAN.md §11). */
const AUSTIN: LatLng = { lat: 30.2672, lng: -97.7431 };

export default function MapScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);

  const [center, setCenter] = useState<LatLng>(AUSTIN);
  const [events, setEvents] = useState<NearbyEvent[]>([]);
  const [showList, setShowList] = useState(false);
  const [sport, setSport] = useState<Sport | null>(null);
  const [skill, setSkill] = useState<SkillLevel | null>(null);
  const [error, setError] = useState<string | null>(null);

  // one-shot: center on the user if they allow it
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(here);
        cameraRef.current?.easeTo({ center: [here.lng, here.lat], zoom: 12, duration: 600 });
      } catch {
        // location unavailable (services off, request interrupted) — stay on
        // the launch-metro fallback
      }
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      setError(null);
      setEvents(
        await fetchEventsNear(center, {
          sport: sport ?? undefined,
          skill: skill ?? undefined,
        })
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [center, sport, skill]);

  // refetch on focus so joins/creations elsewhere show up immediately
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ThemedView style={styles.container}>
      {showList ? (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={[styles.list, { paddingTop: insets.top + Spacing.six }]}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No games nearby yet. Start one!
            </ThemedText>
          }
        />
      ) : (
        <Map
          style={styles.map}
          mapStyle={MAP_STYLE_URL}
          attributionPosition={{ bottom: 8, left: 8 }}
          onRegionDidChange={(e) => {
            const { userInteraction, center: c } = e.nativeEvent;
            if (userInteraction) setCenter({ lat: c[1], lng: c[0] });
          }}>
          <Camera
            ref={cameraRef}
            initialViewState={{ center: [center.lng, center.lat], zoom: 11 }}
          />
          {events.map((ev) => (
            <Marker
              key={ev.id}
              id={ev.id}
              lngLat={[ev.lng, ev.lat]}
              onPress={() =>
                router.push({ pathname: '/event/[id]', params: { id: ev.id } })
              }>
              <View style={[styles.pin, { backgroundColor: theme.background }]}>
                <ThemedText style={styles.pinEmoji}>{SPORT_EMOJI[ev.sport]}</ThemedText>
                <ThemedText type="smallBold">{ev.going_count}</ThemedText>
              </View>
            </Marker>
          ))}
        </Map>
      )}

      {/* filter bar */}
      <View style={[styles.filters, { top: insets.top + Spacing.two }]}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={SPORTS}
          keyExtractor={(s) => s}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item }) => (
            <Chip
              label={`${SPORT_EMOJI[item]} ${SPORT_LABEL[item]}`}
              selected={sport === item}
              onPress={() => setSport(sport === item ? null : item)}
            />
          )}
        />
        {sport !== null && (
          <View style={styles.filterRow}>
            <SkillChips selected={skill} onSelect={setSkill} />
          </View>
        )}
      </View>

      {error && (
        <ThemedView type="backgroundElement" style={[styles.errorBox, { bottom: 96 }]}>
          <ThemedText type="small">{error}</ThemedText>
        </ThemedView>
      )}

      {/* map/list toggle */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showList ? 'Show map' : 'Show list'}
        onPress={() => setShowList((v) => !v)}
        style={[styles.toggle, { backgroundColor: theme.text }]}>
        <Ionicons name={showList ? 'map' : 'list'} size={20} color={theme.background} />
      </Pressable>

      {/* create event */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New game"
        onPress={() =>
          router.push({
            pathname: '/create-event',
            params: { lat: String(center.lat), lng: String(center.lng) },
          })
        }
        style={[styles.fab, { backgroundColor: theme.text }]}>
        <Ionicons name="add" size={28} color={theme.background} />
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.six },
  pin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    elevation: 3,
  },
  pinEmoji: { fontSize: 18 },
  filters: { position: 'absolute', left: 0, right: 0, gap: Spacing.two },
  filterRow: { paddingHorizontal: Spacing.three, gap: Spacing.two, flexDirection: 'row' },
  errorBox: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  toggle: {
    position: 'absolute',
    right: Spacing.three,
    bottom: 96,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fab: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});

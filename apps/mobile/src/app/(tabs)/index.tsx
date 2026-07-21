import Ionicons from '@expo/vector-icons/Ionicons';
import { Camera, Map, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import type { EventSport, LatLng, SkillLevel } from '@pickup/shared';
import { EVENT_SPORTS, OCCUPANCY_TOPIC } from '@pickup/shared';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, SkillChips } from '@/components/chips';
import { EventCard } from '@/components/event-card';
import { VenueSheet } from '@/components/venue-sheet';
import { errorMessage , SPORT_EMOJI, SPORT_LABEL } from '@/lib/format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { CHECKIN_PROMPT_RADIUS_M, distanceMeters } from '@/lib/geo';
import { pushRegistrationSettled } from '@/lib/notifications';
import {
  checkIn,
  fetchEventsNear,
  fetchMyCheckin,
  fetchVenuesNear,
  type MyCheckin,
  type NearbyEvent,
  type NearbyVenue,
} from '@/lib/queries';
import { supabase } from '@/lib/supabase';

const MAP_STYLE_URL =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL || 'https://demotiles.maplibre.org/style.json';

/** Launch metro fallback until location permission resolves (PLAN.md §11). */
const AUSTIN: LatLng = { lat: 30.2672, lng: -97.7431 };

/** Idle venue dots only render from neighborhood zoom in — at metro zoom they
 * are unreadable clutter and their Markers steal taps from event pins (both
 * are native overlay views with no hit-test priority). Live venues always show. */
const VENUE_DOTS_MIN_ZOOM = 13;

/** After a check-in prompt (shown or declined) or a check-out (voluntary or
 * TTL expiry), don't offer another one for a while — courts cluster within
 * the 75m geofence and the venue next door would prompt immediately. */
const PROMPT_COOLDOWN_MS = 15 * 60 * 1000;

export default function MapScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);
  const { session, profile } = useAuth();
  const userId = session!.user.id;

  const [center, setCenter] = useState<LatLng>(AUSTIN);
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [events, setEvents] = useState<NearbyEvent[]>([]);
  const [venues, setVenues] = useState<NearbyVenue[]>([]);
  const [myCheckin, setMyCheckin] = useState<MyCheckin | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<NearbyVenue | null>(null);
  const [showList, setShowList] = useState(false);
  const [sport, setSport] = useState<EventSport | null>(null);
  const [skill, setSkill] = useState<SkillLevel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(11);
  const [refreshing, setRefreshing] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  // one-time center-on-user, deferred until BOTH the GPS fix and the native
  // map are ready — an easeTo issued before the camera mounts is silently
  // dropped, which is exactly what happens on the fast remount after
  // sign-out → sign-in (permission already granted, location resolves first)
  const centeredOnUser = useRef(false);
  // venues we already offered a check-in for this session (§6.1 prompt)
  const promptedVenues = useRef<Set<string>>(new Set());
  const promptCooldownUntil = useRef(0);
  const prevCheckin = useRef<MyCheckin | null>(null);

  // check-in lifecycle → prompt suppression: never re-offer the venue we're
  // (or were) checked into, and cool the prompt off entirely after a check-out
  useEffect(() => {
    const prev = prevCheckin.current;
    prevCheckin.current = myCheckin;
    if (myCheckin) {
      promptedVenues.current.add(myCheckin.venue_id);
    } else if (prev) {
      promptCooldownUntil.current = Date.now() + PROMPT_COOLDOWN_MS;
    }
  }, [myCheckin]);

  // one-shot: center on the user if they allow it
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        // High engages real GNSS — Balanced (~100m) is too coarse to gate a
        // 75m check-in geofence (§6.1) and never wakes GPS on the emulator
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLocation(here);
        setCenter(here);
      } catch {
        // location unavailable (services off, request interrupted) — stay on
        // the launch-metro fallback
      }
    })();
  }, []);

  useEffect(() => {
    if (!mapLoaded || !myLocation || centeredOnUser.current) return;
    centeredOnUser.current = true;
    cameraRef.current?.easeTo({
      center: [myLocation.lng, myLocation.lat],
      zoom: 12,
      duration: 600,
    });
  }, [mapLoaded, myLocation]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [nextEvents, nextVenues, nextCheckin] = await Promise.all([
        fetchEventsNear(center, {
          sport: sport ?? undefined,
          skill: skill ?? undefined,
        }),
        fetchVenuesNear(center, {
          // venues never match 'other' — leave the pins unfiltered instead
          sport: sport === 'other' ? undefined : (sport ?? undefined),
        }),
        fetchMyCheckin(userId),
      ]);
      setEvents(nextEvents);
      setVenues(nextVenues);
      setMyCheckin(nextCheckin);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [center, sport, skill, userId]);

  // refetch on focus so joins/creations elsewhere show up immediately
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // live pin state (§6.1): any check-in change anywhere pings the shared
  // occupancy topic → refetch venue aggregates (coalesced to 1/sec)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    supabase.realtime.setAuth();
    const channel = supabase
      .channel(OCCUPANCY_TOPIC, { config: { private: true } })
      .on('broadcast', { event: 'occupancy' }, () => {
        if (refetchTimer.current) return;
        refetchTimer.current = setTimeout(() => {
          refetchTimer.current = null;
          load();
        }, 1000);
      })
      .subscribe();
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = null;
      supabase.removeChannel(channel);
    };
  }, [load]);

  // geofenced check-in prompt (§6.1): opt-in, one tap, fires from a foreground
  // location read — never from background tracking
  useEffect(() => {
    if (!myLocation || myCheckin || venues.length === 0) return;
    if (Date.now() < promptCooldownUntil.current) return;
    const nearest = venues.find(
      (v) =>
        distanceMeters(myLocation, { lat: v.lat, lng: v.lng }) <= CHECKIN_PROMPT_RADIUS_M &&
        !promptedVenues.current.has(v.id)
    );
    if (!nearest) return;
    promptedVenues.current.add(nearest.id);
    // one prompt per cooldown window, total: clustered courts (Shoal Beach's
    // pickleball + basketball are 49m apart) otherwise chain-prompt — decline
    // one and the neighbor's Alert is already stacking on top of it
    promptCooldownUntil.current = Date.now() + PROMPT_COOLDOWN_MS;
    const sportHere =
      (profile?.sports ?? []).find((s) => nearest.sports.includes(s)) ?? nearest.sports[0];
    (async () => {
      // first launch: the OS notification-permission dialog may be up (push
      // registration) — an Alert shown under it gets swallowed. Wait it out.
      await pushRegistrationSettled();
      Alert.alert(
        `At ${nearest.name}?`,
        `Check in so nearby players can see ${SPORT_LABEL[sportHere].toLowerCase()} is on. Auto-expires in 2 hours.`,
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Check in',
            onPress: async () => {
              try {
                await checkIn(nearest.id, sportHere, myLocation);
                load();
              } catch (e) {
                Alert.alert('Could not check in', errorMessage(e));
              }
            },
          },
        ]
      );
    })();
  }, [myLocation, myCheckin, venues, profile, load]);

  return (
    <ThemedView style={styles.container}>
      {showList ? (
        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={[styles.list, { paddingTop: insets.top + Spacing.six }]}
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await load();
            } finally {
              setRefreshing(false);
            }
          }}
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
          onDidFinishLoadingMap={() => setMapLoaded(true)}
          onRegionDidChange={(e) => {
            const { userInteraction, center: c, zoom: z } = e.nativeEvent;
            setZoom(z);
            if (userInteraction) setCenter({ lat: c[1], lng: c[0] });
          }}>
          <Camera
            ref={cameraRef}
            initialViewState={{ center: [center.lng, center.lat], zoom: 11 }}
          />
          {/* venue layer under event pins; live venues glow green (§6.1);
              idle dots hide below VENUE_DOTS_MIN_ZOOM (declutter + tap priority) */}
          {venues
            .filter((v) => v.live_count > 0 || zoom >= VENUE_DOTS_MIN_ZOOM)
            .map((v) => (
              <Marker
                key={v.id}
                id={v.id}
                lngLat={[v.lng, v.lat]}
                onPress={() => setSelectedVenue(v)}>
                {v.live_count > 0 ? (
                  <View style={[styles.venuePinLive, { backgroundColor: theme.background }]}>
                    <ThemedText type="small">🟢</ThemedText>
                    <ThemedText type="smallBold">{v.live_count}</ThemedText>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.venuePin,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.textSecondary,
                      },
                    ]}
                  />
                )}
              </Marker>
            ))}
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
          data={EVENT_SPORTS}
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

      {/* live check-in banner — tap to reopen the venue sheet / check out */}
      {myCheckin && !showList && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const venue = venues.find((v) => v.id === myCheckin.venue_id);
            if (venue) setSelectedVenue(venue);
          }}
          style={[styles.checkinBanner, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small">
            🟢 Checked in
            {(() => {
              const v = venues.find((x) => x.id === myCheckin.venue_id);
              return v ? ` at ${v.name}` : '';
            })()}
          </ThemedText>
        </Pressable>
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

      <VenueSheet
        venue={selectedVenue}
        myCheckin={myCheckin}
        myLocation={myLocation}
        onClose={() => setSelectedVenue(null)}
        onChanged={load}
      />
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
  venuePin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
  },
  venuePinLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
    elevation: 3,
  },
  checkinBanner: {
    position: 'absolute',
    left: Spacing.three,
    bottom: 96,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
    elevation: 3,
  },
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

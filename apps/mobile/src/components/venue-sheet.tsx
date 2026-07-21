// Venue detail sheet (§6.1): live occupancy aggregates + check in / out.
// Names are never shown — counts and sport mix only (privacy rules, §6.1).
import type { EventSport, LatLng, Sport } from '@pickup/shared';
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { errorMessage, SPORT_EMOJI, SPORT_LABEL } from '@/lib/format';
import { CHECKIN_MAX_RADIUS_M, distanceMeters } from '@/lib/geo';
import {
  checkIn,
  checkOut,
  fetchVenueOccupancy,
  type MyCheckin,
  type NearbyVenue,
  type VenueOccupancy,
} from '@/lib/queries';

type Props = {
  venue: NearbyVenue | null;
  myCheckin: MyCheckin | null;
  /** Device GPS position (not the map center) — gates the check-in button. */
  myLocation: LatLng | null;
  onClose: () => void;
  /** Called after a successful check-in/out so the map can refetch. */
  onChanged: () => void;
};

/** Sport for a check-in: the first of the user's sports this venue hosts. */
function pickSport(venueSports: Sport[], userSports: Sport[]): Sport {
  return userSports.find((s) => venueSports.includes(s)) ?? venueSports[0];
}

export function VenueSheet({ venue, myCheckin, myLocation, onClose, onChanged }: Props) {
  const theme = useTheme();
  const { profile } = useAuth();
  const [occupancy, setOccupancy] = useState<VenueOccupancy | null>(null);
  const [occupancyFor, setOccupancyFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const venueId = venue?.id ?? null;
  // reset during render when the target venue changes (same pattern as the
  // profile form seed) so the effect never sets state synchronously
  if (venueId !== occupancyFor) {
    setOccupancyFor(venueId);
    setOccupancy(null);
  }
  useEffect(() => {
    if (!venueId) return;
    let cancelled = false;
    fetchVenueOccupancy(venueId)
      .then((o) => {
        if (!cancelled) setOccupancy(o);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  if (!venue) return null;

  const checkedInHere = myCheckin?.venue_id === venue.id;
  const near =
    myLocation !== null &&
    distanceMeters(myLocation, { lat: venue.lat, lng: venue.lng }) <= CHECKIN_MAX_RADIUS_M;

  const doCheckIn = async () => {
    if (!myLocation || busy) return;
    setBusy(true);
    try {
      const sport = pickSport(venue.sports, profile?.sports ?? []);
      await checkIn(venue.id, sport, myLocation);
      onChanged();
      onClose();
    } catch (e) {
      Alert.alert('Could not check in', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const doCheckOut = async () => {
    if (busy || !profile) return;
    setBusy(true);
    try {
      await checkOut(profile.id);
      onChanged();
      onClose();
    } catch (e) {
      Alert.alert('Could not check out', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const bySport = Object.entries(occupancy?.by_sport ?? {}) as [EventSport, number][];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.background }]}
          onPress={(e) => e.stopPropagation()}>
          <ThemedText type="subtitle">{venue.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {venue.sports.map((s) => SPORT_LABEL[s]).join(' · ')}
            {venue.court_count ? ` · ${venue.court_count} courts` : ''}
          </ThemedText>
          {venue.address ? (
            <ThemedText type="small" themeColor="textSecondary">
              📍 {venue.address}
            </ThemedText>
          ) : null}

          <View style={[styles.liveBox, { backgroundColor: theme.backgroundElement }]}>
            {occupancy === null ? (
              <ThemedText type="small" themeColor="textSecondary">
                Checking who&apos;s playing…
              </ThemedText>
            ) : occupancy.checkin_count > 0 ? (
              <>
                <ThemedText type="smallBold">
                  🟢 {occupancy.checkin_count} playing right now
                </ThemedText>
                {bySport.map(([sport, n]) => (
                  <ThemedText key={sport} type="small" themeColor="textSecondary">
                    {SPORT_EMOJI[sport]} {SPORT_LABEL[sport]}: {n}
                  </ThemedText>
                ))}
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                No one checked in right now.
              </ThemedText>
            )}
            {occupancy !== null && occupancy.expected_from_rsvps > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {occupancy.expected_from_rsvps} expected from scheduled games
              </ThemedText>
            )}
          </View>

          {checkedInHere ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={doCheckOut}
              style={[styles.button, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText>Check out</ThemedText>
            </Pressable>
          ) : near ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={doCheckIn}
              style={[styles.button, { backgroundColor: theme.text }]}>
              <ThemedText style={{ color: theme.background }}>
                {busy ? 'Checking in…' : "I'm here — check in"}
              </ThemedText>
            </Pressable>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Check-in unlocks when you&apos;re at the court.
            </ThemedText>
          )}
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
    gap: Spacing.two,
  },
  liveBox: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginTop: Spacing.two,
  },
  hint: { textAlign: 'center', marginTop: Spacing.two },
});

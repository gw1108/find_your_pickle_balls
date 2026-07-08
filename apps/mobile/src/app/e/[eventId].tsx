import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Invite-link landing route: https://pickupsports.app/e/<id> (and
 * pickup://e/<id> from the worker's OG page) both resolve here, then
 * forward to the real event screen. Signed-out users fall back to
 * sign-in via the root layout's Stack.Protected guards — deferred
 * deep-linking after auth is a post-launch item (PLAN.md §7).
 */
export default function EventLink() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  if (!eventId) return <Redirect href="/" />;
  return <Redirect href={{ pathname: '/event/[id]', params: { id: eventId } }} />;
}

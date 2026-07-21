import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Sport } from '@pickup/shared';

/** In-progress onboarding form values, persisted so the user resumes where
 * they left off after closing the app. Best-effort only — every operation
 * swallows storage errors; the final submit is the source of truth. */
export type OnboardingDraft = {
  displayName?: string;
  /** Calendar date as yyyy-mm-dd (profiles.birthdate is a DATE column). */
  birthdate?: string;
  sports?: Sport[];
};

// Keyed by user id so another account on the same device never sees this draft
const key = (userId: string) => `onboarding-draft:${userId}`;

export async function loadDraft(userId: string): Promise<OnboardingDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as OnboardingDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: OnboardingDraft): void {
  AsyncStorage.setItem(key(userId), JSON.stringify(draft)).catch(() => {});
}

export function clearDraft(userId: string): void {
  AsyncStorage.removeItem(key(userId)).catch(() => {});
}

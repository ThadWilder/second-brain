// Deep-link capture for shared referral + job links.
//
// A visitor landing on subhub.biz/?ref=CODE or /?job=ID is bounced through
// auth before the app can act on those params, so we stash them at launch and
// replay them once the user has a profile:
//   • ref  → claimed as a referral at onboarding (credibility boost)
//   • job  → the "account gate" on a shared job: the full card is only shown
//            after sign-up, so we route the new user straight to it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

const REF_KEY = 'subhub.pending.ref';
const JOB_KEY = 'subhub.pending.job';

// Read ?ref / ?job from the web URL on launch and persist them. No-op on native
// (native deep links arrive via expo-linking — see captureNativeLinkParams).
export async function captureEntryParams(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !window.location?.search) return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const job = params.get('job');
    if (ref) await AsyncStorage.setItem(REF_KEY, ref);
    if (job) await AsyncStorage.setItem(JOB_KEY, job);
  } catch { /* ignore */ }
}

// Parse ?ref / ?job from a native deep-link URL (subhub://...) and persist
// them. Called from the expo-linking initial-URL check and the URL listener in
// the root layout.
export async function captureNativeLinkParams(url: string | null): Promise<void> {
  if (!url || Platform.OS === 'web') return;
  try {
    const parsed = Linking.parse(url);
    const qp = parsed.queryParams ?? {};
    const ref = typeof qp.ref === 'string' ? qp.ref : null;
    const job = typeof qp.job === 'string' ? qp.job : null;
    if (ref) await AsyncStorage.setItem(REF_KEY, ref);
    if (job) await AsyncStorage.setItem(JOB_KEY, job);
  } catch { /* ignore */ }
}

export async function getPendingRef(): Promise<string | null> {
  try { return await AsyncStorage.getItem(REF_KEY); } catch { return null; }
}

export async function consumePendingRef(): Promise<string | null> {
  const v = await getPendingRef();
  if (v) await AsyncStorage.removeItem(REF_KEY).catch(() => {});
  return v;
}

export async function consumePendingJob(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(JOB_KEY);
    if (v) await AsyncStorage.removeItem(JOB_KEY);
    return v;
  } catch { return null; }
}

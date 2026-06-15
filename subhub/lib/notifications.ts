import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'SubHub',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  await saveToken(token);
  return token;
}

async function saveToken(token: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' }
  );
}

// Called from Edge Functions — client-side helper for direct sends (Phase 1 only).
// In Phase 2 all sends go through the send-notification Edge Function triggered by DB changes.
export async function sendPushToUser(userId: string, title: string, body: string, data?: object) {
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (!tokens?.length) return;

  const messages = tokens.map(({ token }) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
  }));

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
}

// Notification type helpers
export const notify = {
  jobClaimed: (contractorId: string, jobTitle: string, subName: string) =>
    sendPushToUser(contractorId, 'Job Claimed', `${subName} claimed "${jobTitle}"`, { type: 'job_claimed' }),

  newMessage: (recipientId: string, senderName: string, jobTitle: string, jobId: string) =>
    sendPushToUser(recipientId, `Message from ${senderName}`, jobTitle, { type: 'message', jobId }),

  changeOrderFiled: (recipientId: string, jobTitle: string, jobId: string) =>
    sendPushToUser(recipientId, 'Change Order Filed', `Review the change for "${jobTitle}"`, { type: 'change_order', jobId }),

  changeOrderApproved: (recipientId: string, jobTitle: string) =>
    sendPushToUser(recipientId, 'Change Order Approved', `Both parties approved the change for "${jobTitle}"`, { type: 'change_order_approved' }),

  jobComplete: (contractorId: string, jobTitle: string, jobId: string) =>
    sendPushToUser(contractorId, 'Job Marked Complete', `"${jobTitle}" is ready for your review`, { type: 'job_complete', jobId }),

  paymentReleased: (subId: string, amount: number) =>
    sendPushToUser(subId, 'Payment Released', `$${amount.toLocaleString()} has been sent to your account`, { type: 'payment_released' }),
};

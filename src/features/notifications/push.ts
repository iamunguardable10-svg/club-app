'use client';

/**
 * This device and push notifications (piece 7): whether it can get them,
 * turning them on (browser permission, subscription, saved on the server)
 * and off again.
 */

import { SERVICE_WORKER_URL } from '@/features/install/ServiceWorkerRegistration';
import { deletePushSubscription, getPushPublicKey, LocalDataError, savePushSubscription } from '@/shared/data';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return isPushSupported() ? Notification.permission : 'unsupported';
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // Registered at start in production; make sure it exists here too.
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register(SERVICE_WORKER_URL);
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ? existing.pushManager.getSubscription() : null;
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64Url}${'='.repeat((4 - (base64Url.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function toSaved(subscription: PushSubscription) {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new LocalDataError('The browser returned an incomplete subscription.');
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/** Asks for permission and subscribes this device. Throws with a readable message when that is not possible. */
export async function enablePush(): Promise<void> {
  if (!isPushSupported()) throw new LocalDataError('This browser cannot show notifications.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new LocalDataError('Notifications were not allowed. You can allow them later in the browser settings for this site.');
  const publicKey = await getPushPublicKey();
  if (!publicKey) throw new LocalDataError('Notifications are not set up on the server yet.');
  const worker = await registration();
  await navigator.serviceWorker.ready;
  const subscription = (await worker.pushManager.getSubscription())
    ?? (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  try {
    await savePushSubscription(toSaved(subscription));
  } catch (error) {
    // The server does not know this device, so it would never get anything:
    // undo the browser side too, so "on" always means on.
    await subscription.unsubscribe().catch(() => undefined);
    throw error;
  }
}

export async function disablePush(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  await deletePushSubscription(subscription.endpoint);
  await subscription.unsubscribe();
}

/**
 * Re-saves this device's subscription for the signed-in account, e.g. after
 * the browser renewed it. Silent: a failure only means no notifications.
 */
export async function syncPushSubscription(): Promise<void> {
  try {
    if (pushPermission() !== 'granted') return;
    const subscription = await currentPushSubscription();
    if (subscription) await savePushSubscription(toSaved(subscription));
  } catch {
    // Not signed in, offline, or the server has no keys yet.
  }
}

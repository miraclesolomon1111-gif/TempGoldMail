/**
 * Push Notifications Service for TempGoldMail
 * Supports Web Notifications API, Service Worker Push, and Audio chime
 */

let swRegistration: ServiceWorkerRegistration | null = null;

// Initialize Service Worker registration for Push Notifications
export async function initPushNotifications(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    swRegistration = reg;
    console.log('[PUSH] Service Worker registered for push notifications:', reg.scope);
    return reg;
  } catch (err) {
    console.warn('[PUSH] Service Worker registration failed:', err);
    return null;
  }
}

// Check if notifications are supported
export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

// Current notification permission
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

// Request permission from user
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      // Play a quick chime to confirm audio & show a confirmation notification
      playNotificationChime();
      triggerPushNotification({
        title: '🔔 Push Notifications Active',
        body: 'You will now receive instant push alerts for all incoming emails.',
        tag: 'welcome-notification'
      });
      return true;
    }
    return false;
  } catch (err) {
    console.error('[PUSH] Failed to request notification permission:', err);
    return false;
  }
}

// Play pleasant modern email chime using Web Audio API
export function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Tone 1 (soft ding)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Tone 2 (higher ring)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.1); // A5
    gain2.gain.setValueAtTime(0.12, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.6);
  } catch (e) {
    console.warn('[PUSH] Audio chime note:', e);
  }
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  tag?: string;
  emailId?: string;
  sender?: string;
  onClick?: () => void;
}

// Display push notification to user (works on Mobile Chrome + Desktop)
export async function triggerPushNotification(payload: PushNotificationPayload) {
  if (!isPushSupported() || Notification.permission !== 'granted') {
    return;
  }

  // Play incoming email sound
  playNotificationChime();

  const title = payload.title;
  const options: any = {
    body: payload.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.tag || `email-${Date.now()}`,
    vibrate: [200, 100, 200],
    data: {
      url: '/#email',
      emailId: payload.emailId
    }
  };

  // Try Service Worker showNotification first (Standard for Mobile Chrome on Android)
  if ('serviceWorker' in navigator) {
    try {
      const reg = swRegistration || (await navigator.serviceWorker.getRegistration());
      if (reg && reg.showNotification) {
        await reg.showNotification(title, options);
        return;
      }
    } catch (swErr) {
      console.warn('[PUSH] Service Worker showNotification fallback:', swErr);
    }
  }

  // Fallback to standard window Notification
  try {
    const notif = new Notification(title, options);
    notif.onclick = () => {
      window.focus();
      if (payload.onClick) {
        payload.onClick();
      }
      notif.close();
    };
  } catch (e) {
    console.warn('[PUSH] Window Notification error:', e);
  }
}

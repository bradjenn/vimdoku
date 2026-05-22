export type DailyReminderSubscription = {
  auth: string
  endpoint: string
  p256dh: string
  reminderHour: number
  timezone: string
  userAgent?: string
}

export function pushRemindersSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export async function subscribeToDailyReminder(
  publicKey: string,
): Promise<DailyReminderSubscription> {
  if (!pushRemindersSupported()) {
    throw new Error('Push reminders are not supported in this browser.')
  }
  if (!publicKey) throw new Error('Push reminders are not configured yet.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      applicationServerKey: urlBase64ToUint8Array(publicKey),
      userVisibleOnly: true,
    }))
  const json = subscription.toJSON()
  const auth = json.keys?.auth
  const p256dh = json.keys?.p256dh

  if (!auth || !p256dh) {
    throw new Error('Could not read browser push keys.')
  }

  return {
    auth,
    endpoint: subscription.endpoint,
    p256dh,
    reminderHour: 9,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    userAgent: navigator.userAgent,
  }
}

export async function unsubscribeFromDailyReminder() {
  if (!pushRemindersSupported()) return false

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return false
  return await subscription.unsubscribe()
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }

  return output
}

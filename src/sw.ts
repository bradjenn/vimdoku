/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
self.skipWaiting()
clientsClaim()

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cachedShell = await caches.match('/index.html')
      return cachedShell ?? Response.error()
    }),
  )
})

self.addEventListener('push', (event) => {
  let payload: {
    body?: string
    tag?: string
    title?: string
    url?: string
  } = {}

  try {
    payload = event.data?.json() ?? {}
  } catch {
    payload = {
      body: event.data?.text(),
    }
  }

  const title = payload.title ?? 'Daily Vimdoku'
  const url = payload.url ?? '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      badge: '/pwa-192.png',
      body: payload.body ?? "Today's puzzle is waiting.",
      data: { url },
      icon: '/pwa-192.png',
      tag: payload.tag ?? 'vimdoku-daily-reminder',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = String(event.notification.data?.url ?? '/')
  const targetUrl = new URL(url, self.location.origin).href

  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: 'window' })
      .then((clients) => {
        const existing = clients.find((client) => client.url === targetUrl)
        if (existing) return existing.focus()
        return self.clients.openWindow(targetUrl)
      }),
  )
})

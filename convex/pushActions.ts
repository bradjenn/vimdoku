'use node'

import webPush from 'web-push'
import { internal } from './_generated/api'
import { internalAction } from './_generated/server'

type WebPushSendError = Error & {
  statusCode?: number
}

export const sendDailyReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY

    if (!publicKey || !privateKey) {
      console.warn('Skipping daily reminders: VAPID keys are not configured.')
      return {
        disabled: 0,
        sent: 0,
        skipped: true,
      }
    }

    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? 'mailto:hello@bigthumb.digital',
      publicKey,
      privateKey,
    )

    const due = await ctx.runQuery(
      internal.pushSubscriptions.dueDailyReminders,
      {
        now: Date.now(),
      },
    )
    let sent = 0
    let disabled = 0

    for (const subscription of due) {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              auth: subscription.auth,
              p256dh: subscription.p256dh,
            },
          },
          JSON.stringify({
            body: "Today's puzzle is waiting.",
            tag: `vimdoku-daily-${subscription.dateKey}`,
            title: 'Daily Vimdoku',
            url: '/new',
          }),
        )
        await ctx.runMutation(internal.pushSubscriptions.markSent, {
          dateKey: subscription.dateKey,
          subscriptionId: subscription._id,
        })
        sent += 1
      } catch (error) {
        if (isExpiredPushSubscription(error)) {
          await ctx.runMutation(internal.pushSubscriptions.disableById, {
            subscriptionId: subscription._id,
          })
          disabled += 1
          continue
        }

        console.warn('Could not send daily reminder.', error)
      }
    }

    return {
      disabled,
      sent,
      skipped: false,
    }
  },
})

function isExpiredPushSubscription(error: unknown): error is WebPushSendError {
  if (!(error instanceof Error)) return false
  const statusCode = (error as WebPushSendError).statusCode
  return statusCode === 404 || statusCode === 410
}

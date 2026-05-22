import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.cron(
  'send daily puzzle reminders',
  '0 * * * *',
  internal.pushActions.sendDailyReminders,
  {},
)

export default crons

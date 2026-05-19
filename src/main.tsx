import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { ConvexProvider } from 'convex/react'
import './index.css'
import App from './App.tsx'
import { convexClient } from './convexClient.ts'

const rootRoute = createRootRoute({
  component: App,
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => null,
})

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play',
  component: () => null,
})

const dailyPlayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/daily/$difficulty/$date',
  component: () => null,
})

const shortDailyPlayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/$difficulty/$date',
  component: () => null,
})

const menuRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/menu',
  component: () => null,
})

const newRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/new',
  component: () => null,
})

const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/games',
  component: () => null,
})

const leaderboardsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/leaderboards',
  component: () => null,
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: () => null,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: () => null,
})

const commandsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/commands',
  component: () => null,
})

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  playRoute,
  dailyPlayRoute,
  shortDailyPlayRoute,
  menuRoute,
  newRoute,
  gamesRoute,
  leaderboardsRoute,
  profileRoute,
  settingsRoute,
  commandsRoute,
])

const router = createRouter({
  routeTree,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const routedApp = <RouterProvider router={router} />
const app = convexClient ? (
  <ConvexProvider client={convexClient}>{routedApp}</ConvexProvider>
) : (
  routedApp
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {app}
  </StrictMode>,
)

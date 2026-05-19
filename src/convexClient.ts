import { ConvexReactClient } from 'convex/react';

export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string | undefined;
export const convexClient = CONVEX_URL ? new ConvexReactClient(CONVEX_URL) : null;

export function hasConvexBackend() {
  return Boolean(convexClient);
}

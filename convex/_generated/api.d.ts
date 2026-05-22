/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as challenges from "../challenges.js";
import type * as crons from "../crons.js";
import type * as friends from "../friends.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as leaderboards from "../leaderboards.js";
import type * as liveBattles from "../liveBattles.js";
import type * as notifications from "../notifications.js";
import type * as profiles from "../profiles.js";
import type * as pushActions from "../pushActions.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  challenges: typeof challenges;
  crons: typeof crons;
  friends: typeof friends;
  games: typeof games;
  http: typeof http;
  leaderboards: typeof leaderboards;
  liveBattles: typeof liveBattles;
  notifications: typeof notifications;
  profiles: typeof profiles;
  pushActions: typeof pushActions;
  pushSubscriptions: typeof pushSubscriptions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

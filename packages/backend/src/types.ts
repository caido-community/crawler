import type { DefineEvents, SDK } from "caido:plugin";
import type { BackendEvents as SharedBackendEvents } from "shared";

import type { API } from ".";

export type BackendSDK = SDK<API, BackendEvents>;

export type BackendEvents = DefineEvents<SharedBackendEvents>;

/**
 * Type alias for the intercepted request from onInterceptResponse callback
 * Extracts the second parameter type from the callback signature
 */
export type InterceptedRequest = Parameters<
  Parameters<BackendSDK["events"]["onInterceptResponse"]>[0]
>[1];

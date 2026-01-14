import type { DefineEvents, SDK } from "caido:plugin";
import type { BackendEvents as SharedBackendEvents } from "shared";

import type { API } from ".";

export type BackendSDK = SDK<API, BackendEvents>;

export type BackendEvents = DefineEvents<SharedBackendEvents>;

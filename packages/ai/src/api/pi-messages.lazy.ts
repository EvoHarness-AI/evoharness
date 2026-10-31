import type { ProviderStreams } from "../types.ts";
import { lazyApi } from "./lazy.ts";

export const evoharnessMessagesApi = (): ProviderStreams => lazyApi(() => import("./pi-messages.ts"));

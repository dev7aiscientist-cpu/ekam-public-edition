// Standalone @hatch/space-sdk replacement.
//
// EKAM's server actions (server/actions.ts) were written against the Muse
// space runtime's SDK. At runtime the actions only use two things from it:
//   - defineAction(spec)  → a plain action descriptor object
//   - z                   → zod (validation schemas)
// This module provides exactly that surface, with the same descriptor shape
// the original SDK produces (see ACTION_BRAND), so the unmodified actions
// code runs on the standalone host in host/host.ts.

import { z } from "zod";

export { z };

export const ACTION_BRAND = "@hatch/space-sdk/action/v1";

export function defineAction(spec) {
  return {
    __brand: ACTION_BRAND,
    request: spec.request,
    response: spec.response,
    ...(spec.privileged !== undefined ? { privileged: spec.privileged } : {}),
    handler: spec.handler,
  };
}

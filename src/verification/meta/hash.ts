/**
 * §38 hashing (§29.7 replay, §29.8 checkpoints). The SHA-256 + key-sorted serializer already live
 * in `battlelog.ts` (the logger needs them for its own state hash); re-exported here so the
 * verification layer has one import for hashing without reaching into the logger.
 */
export { sha256Hex, stableJson } from '../../core/battlelog'

import { sha256Hex, stableJson } from '../../core/battlelog'

/** §29.7 event-stream hash: identical config + seed must yield an identical hash. */
export function eventHash(events: unknown[]): string {
  return sha256Hex(stableJson(events))
}

/** §38 state hash over a `StateSnapshot`-shaped object (or any key-sortable state). */
export function computeStateHash(state: unknown): string {
  return sha256Hex(stableJson(state))
}

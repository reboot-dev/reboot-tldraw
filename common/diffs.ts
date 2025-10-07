import { type RecordId, type RecordsDiff } from "@tldraw/store";
import {
  type NetworkDiff,
  RecordOpType,
  applyObjectDiff,
} from "@tldraw/sync-core";
import { type TLStore } from "@tldraw/tlschema";
import { isEqual, objectMapEntries } from "@tldraw/utils";

// This helper function is taken almost verbatim from
// https://github.com/tldraw/tldraw/blob/main/packages/sync-core/src/lib/TLSyncClient.ts.
//
// We use `NetworkDiff` to send less data to/from the backend.
export function applyNetworkDiff(
  store: TLStore,
  diff: NetworkDiff<R>,
  { runCallbacks = false }: { runCallbacks?: boolean } = {}
) {
  const changes: RecordsDiff<R> = {
    added: {} as any,
    updated: {} as any,
    removed: {} as any,
  };

  type k = keyof typeof changes.updated;

  let hasChanges = false;

  for (const [id, op] of objectMapEntries(diff)) {
    if (op[0] === RecordOpType.Put) {
      const existing = store.get(id as RecordId<any>);
      if (existing && !isEqual(existing, op[1])) {
	hasChanges = true;
	changes.updated[id as k] = [existing, op[1]];
      } else {
	hasChanges = true;
	changes.added[id as k] = op[1];
      }
    } else if (op[0] === RecordOpType.Patch) {
      const record = store.get(id as RecordId<any>);
      if (!record) {
	// The record was removed upstream.
	continue;
      }
      const patched = applyObjectDiff(record, op[1]);
      hasChanges = true;
      changes.updated[id as k] = [record, patched];
    } else if (op[0] === RecordOpType.Remove) {
      if (store.has(id as RecordId<any>)) {
	hasChanges = true;
	changes.removed[id as k] = store.get(id as RecordId<any>);
      }
    }
  }
  if (hasChanges) {
    store.applyDiff(changes, { runCallbacks });
  }
}

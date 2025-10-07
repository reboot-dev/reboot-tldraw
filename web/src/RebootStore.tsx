import {
  type RecordsDiff,
  isRecordsDiffEmpty,
  reverseRecordsDiff,
  squashRecordDiffs,
} from "@tldraw/store";
import {
  type TLStore,
  type TLStoreSnapshot
} from "@tldraw/tlschema";
// import { WeakCache } from "@tldraw/utils";
import { useEffect, useRef, useState } from "react";
import { WebContext } from "@reboot-dev/reboot-web";
import {
  type TLEditorSnapshot,
  type TLSessionStateSnapshot,
  type TLStoreOptions,
  type TLStoreWithStatus,
  createTLStore,
  useShallowObjectIdentity,
  useRefState,
} from "@tldraw/editor";
// import { TLLocalSyncClient } from "../utils/sync/TLLocalSyncClient";
import { useAuthority } from "../../api/rbt/thirdparty/tldraw/v1/authority_rbt_react.js";
import { Authority } from "../../api/rbt/thirdparty/tldraw/v1/authority_rbt_web.js";

export function useRebootStore(
  options: {
    persistenceKey: string
    sessionId?: string
    snapshot?: TLEditorSnapshot | TLStoreSnapshot
  } & TLStoreOptions
): TLStoreWithStatus {
  const [storeWithStatus, setStoreWithStatus] = useRefState<TLStoreWithStatus>({ status: "loading" });

  options = useShallowObjectIdentity(options);

  const { persistenceKey, sessionId, ...rest } = options;

  const store = useRef<TLStore | undefined>();

  function initializeStore() {
    return createTLStore({ ...rest });
  }

  const authority = useAuthority({ id: persistenceKey });

  const version = useRef<number>(0);
  const diffsToBeApplied = useRef<RecordsDiff[]>([]);
  const diffsBeingApplied = useRef<RecordsDiff[]>([]);
  const applying = useRef<boolean>(false);
  
  useEffect(() => {
    if (!store.current) {
      store.current = initializeStore();
    }

    const stopListenForUserAndDocumentChanges = store.current.listen(
      async ({ changes }) => {
        if (!isRecordsDiffEmpty(changes)) {
          diffsToBeApplied.current = [...diffsToBeApplied.current, changes];
        }
        if (!applying.current) {
          applying.current = true;
          while (diffsToBeApplied.current.length > 0) {
            diffsBeingApplied.current = diffsToBeApplied.current;
            diffsToBeApplied.current = [];
            // TODO: cap max amount of changes to send?
            const versionForApply = version.current;
            const { response } = await authority.apply({
              diffs: diffsBeingApplied.current,
              version: versionForApply,
            });
            if (response) {
              diffsBeingApplied.current = [];
              // We're racing with `changes()` so we only want to
              // update the version if we're first.
              if (version.current < response.version) {
                version.current = response.version;
              }
            } else {
              // Put the diff back and try again.
              diffsToBeApplied.current = [
                ...diffsBeingApplied.current, ...diffsToBeApplied.current
              ];
            }
          }
          applying.current = false;
        }
      },
      { source: "user", scope: "document" }
    );

    const stopListenForSessionChanges = store.current.listen(
      (what) => {
	// TODO: handle session changes.
      },
      { scope: "session" }
    );

    const load = async () => {
      setStoreWithStatus({ status: "loading" });

      const { response } = await authority.create();

      if (response.snapshot) {
        store.current.loadStoreSnapshot(response.snapshot);
      }

      version.current = response.version;

      setStoreWithStatus({ status: "synced-local", store: store.current });
    };

    load();

    return () => {
      stopListenForUserAndDocumentChanges();
      stopListenForSessionChanges();
    };
  }, [setStoreWithStatus]);

  useEffect(() => {
    if (!store.current) {
      store.current = initializeStore();
    }

    const context = new WebContext({ url: "http://localhost:9991" });

    const authority = Authority.ref(persistenceKey);

    const abortController = new AbortController();

    let sinceVersion = version.current;

    const reactToChanges = async () => {
      const [responses, setRequest] = await authority
        .reactively()
        .changes(
          context,
          { sinceVersion },
          { signal: abortController.signal }
        );

      for await (const response of responses) {
        if (response.diffs.length === 0) {
          continue;
        }

        store.current.mergeRemoteChanges(() => {
          // First unapply any local changes.
          const diffs = [
            ...diffsBeingApplied.current, ...diffsToBeApplied.current
          ];
          if (diffs.length > 0) {
            store.current.applyDiff(
              reverseRecordsDiff(squashRecordDiffs(diffs)),
              { runCallbacks: false }
            );
          }

          // Now apply the diffs we received.
          store.current.applyDiff(squashRecordDiffs(response.diffs));

          // Now re-apply local changes on top of what is authoritative.
          if (diffs.length > 0) {
            try {
              // Need to do this separately for `diffsBeingApplied`
              // and `diffsToBeApplied` so that any outstanding `apply()
              // will work properly.
              let diff = store.current.extractingChanges(() => {
	        store.current.applyDiff(
                  squashRecordDiffs(diffsBeingApplied.current)
                );
	      });
              if (!isRecordsDiffEmpty(diff)) {
	        diffsBeingApplied.current = [diff];
              }
              diff = store.current.extractingChanges(() => {
	        store.current.applyDiff(
                  squashRecordDiffs(diffsToBeApplied.current)
                );
	      });
              if (!isRecordsDiffEmpty(diff)) {
                diffsToBeApplied.current = [diff];
              }
	    } catch (e) {
	      console.error(e)
              // TODO: can we even get here?
	    }
          }
        });

        // Update `sinceVersion` and if necessary also update the
        // `version` ref to avoid having to re-apply just to get to
        // the latest version.
        sinceVersion += response.diffs.length;

        if (version.current < sinceVersion) {
          version.current = sinceVersion;
        }

        setRequest({ sinceVersion });
      }
    };

    reactToChanges();

    return () => {
      abortController.abort();
    };
  }, [persistenceKey]);

  return storeWithStatus;
}

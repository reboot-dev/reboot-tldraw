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
import { getNetworkDiff } from "@tldraw/sync-core";
import { useEffect, useRef, useState } from "react";
import { assert } from "@reboot-dev/reboot-api";
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
import { applyNetworkDiff } from "../../common/diffs.js";
import { useAuthority } from "../../api/rbt/thirdparty/tldraw/v1/authority_rbt_react.js";
import { Authority } from "../../api/rbt/thirdparty/tldraw/v1/authority_rbt_web.js";

export function useRebootStore(
  options: {
    persistenceKey: string
    sessionId?: string
    snapshot?: TLEditorSnapshot | TLStoreSnapshot
  } & TLStoreOptions
): TLStoreWithStatus {
  const [storeWithStatus, setStoreWithStatus] = useRefState<TLStoreWithStatus>({
    status: "loading"
  });

  options = useShallowObjectIdentity(options);

  const { persistenceKey, sessionId, ...rest } = options;

  const store = useRef<TLStore | undefined>();

  const authority = useAuthority({ id: persistenceKey });

  const version = useRef<number>(0);
  const diffsToBeApplied = useRef<RecordsDiff[]>([]);
  const diffsBeingApplied = useRef<RecordsDiff[]>([]);
  const applying = useRef<boolean>(false);

  useEffect(() => {
    if (!store.current) {
      // TODO: support passing in `...rest`.
      store.current = createTLStore({});
    }

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
  }, [setStoreWithStatus]);

  useEffect(() => {
    // We want to wait until we're `synced-local` to start
    // listening.
    //
    // TODO: technically we want to start listening _before_
    // 'synced-local' gets set so that we don't miss any changes.
    if (storeWithStatus.status === "synced-local") {
      assert(store.current);

      const stopListenForUserAndDocumentChanges = store.current.listen(
        async ({ changes }) => {
          const networkDiff = getNetworkDiff(changes);
          if (!networkDiff) {
            return;
          }
          diffsToBeApplied.current = [...diffsToBeApplied.current, changes];
          if (!applying.current) {
            applying.current = true;
            while (diffsToBeApplied.current.length > 0) {
              diffsBeingApplied.current = diffsToBeApplied.current;
              diffsToBeApplied.current = [];
              // TODO: cap max amount of changes to send?
              const versionForApply = version.current;
              const { response } = await authority.apply({
                diff: getNetworkDiff(
                  squashRecordDiffs(diffsBeingApplied.current)
                ),
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

      const context = new WebContext({ url: "http://localhost:9991" });

      const abortController = new AbortController();

      let sinceVersion = version.current;

      const reactToChanges = async () => {
        const [responses, setRequest] = await Authority.ref(persistenceKey)
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
            if (
                diffsBeingApplied.current.length > 0 ||
                diffsToBeApplied.current.length > 0
            ){
              store.current.applyDiff(
                reverseRecordsDiff(
                  squashRecordDiffs([
                    ...diffsBeingApplied.current, ...diffsToBeApplied.current
                  ])
                ),
                { runCallbacks: false }
              );
            }

            // Now apply the diffs we received.
            for (const diff of response.diffs) {
              applyNetworkDiff(store.current, diff);
            }

            // Now re-apply local changes on top of what is authoritative.
            try {
              // Need to do this separately for `diffsBeingApplied`
              // and `diffsToBeApplied` so that any outstanding `apply()
              // will work properly.
              if (diffsBeingApplied.current.length > 0) {
                const diff = store.current.extractingChanges(() => {
                  store.current.applyDiff(
                    squashRecordDiffs(diffsBeingApplied.current)
                  );
                });
                if (!isRecordsDiffEmpty(diff)) {
                  diffsBeingApplied.current = [diff];
                }
              }
              if (diffsToBeApplied.current.length > 0) {
                const diff = store.current.extractingChanges(() => {
                  store.current.applyDiff(
                    squashRecordDiffs(diffsToBeApplied.current)
                  );
                });
                if (!isRecordsDiffEmpty(diff)) {
                  diffsToBeApplied.current = [diff];
                }
              }
            } catch (e) {
              console.error(e)
              // TODO: can we even get here?
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
        stopListenForUserAndDocumentChanges();
        stopListenForSessionChanges();
        abortController.abort();
      };
    }
  }, [storeWithStatus, persistenceKey]);

  return storeWithStatus;
}

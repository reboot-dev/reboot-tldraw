import { type Signal } from "@tldraw/state";
import {
  // TLAsset, TLAssetStore,
  type TLStoreSnapshot
} from "@tldraw/tlschema";
// import { WeakCache } from "@tldraw/utils";
import { useEffect } from "react";
import {
  type TLEditorSnapshot,
  type TLSessionStateSnapshot,
  type TLStoreOptions,
  type TLStoreWithStatus,
  createSessionStateSnapshotSignal,
  createTLStore,
  loadSessionStateSnapshotIntoStore,
  useShallowObjectIdentity,
  useRefState,
} from "@tldraw/editor";
// import { TLLocalSyncClient } from "../utils/sync/TLLocalSyncClient";

export function useRebootStore(
  options: {
    persistenceKey?: string
    sessionId?: string
    snapshot?: TLEditorSnapshot | TLStoreSnapshot
  } & TLStoreOptions
): TLStoreWithStatus {
  const [state, setState] = useRefState<TLStoreWithStatus>({ status: "loading" });

  options = useShallowObjectIdentity(options);

  useEffect(() => {
    const { persistenceKey, sessionId, ...rest } = options;

    if (!persistenceKey) {
      setState({
	status: "not-synced",
	store: createTLStore(rest),
      });
      return;
    }

    setState({ status: "loading" });

    // const objectURLCache = new WeakCache<TLAsset, Promise<string | null>>();
    // const assets: TLAssetStore = {
    //   upload: async (asset, file) => {
    //     await client.db.storeAsset(asset.id, file);
    //     return { src: asset.id };
    //   },
    //   resolve: async (asset) => {
    //     if (!asset.props.src) return null;

    //     if (asset.props.src.startsWith("asset:")) {
    //       return await objectURLCache.get(asset, async () => {
    //         const blob = await client.db.getAsset(asset.id);
    //         if (!blob) return null;
    //         return URL.createObjectURL(blob);
    //       });
    //     }

    //     return asset.props.src;
    //   },
    //   remove: async (assetIds) => {
    //     await client.db.removeAssets(assetIds);
    //   },
    //   ...rest.assets,
    // };

    const store = createTLStore({
      ...rest,
      // assets
    });

    const snapshot = localStorage.getItem(
      `reboot-tldraw-document6-${persistenceKey}`
    );

    if (snapshot !== null) {
      store.loadStoreSnapshot(JSON.parse(snapshot));
    }

    // const $sessionStateSnapshot: Signal<TLSessionStateSnapshot | null> =
    //   createSessionStateSnapshotSignal(store);

    let changesUntilStore = 10;

    const stopListenForUserAndDocumentChanges = store.listen(
      ({ changes }) => {
        // console.log(`USER/DOCUMENT CHANGED: ${JSON.stringify(changes)}`);
        changesUntilStore -= 1;
        if (changesUntilStore === 0) {
          localStorage.setItem(
            `reboot-tldraw-document6-${persistenceKey}`,
            JSON.stringify(store.getStoreSnapshot())
          );
          console.log("STORED");
          changesUntilStore = 10;
        }
      },
      { source: "user", scope: "document" }
    );

    const stopListenForSessionChanges = store.listen(
      (what) => {
	// console.log(`SESSION CHANGED: ${JSON.stringify(what)}`);
      },
      { scope: "session" }
    );

    setState({
      status: "synced-local",
      store,
    });

    // let isClosed = false;

    // const client = new TLLocalSyncClient(store, {
    //   sessionId,
    //   persistenceKey,
    //   onLoad() {
    //     if (isClosed) return;
    //     setState({ store, status: "synced-local" });
    //   },
    //   onLoadError(err: any) {
    //     if (isClosed) return;
    //     setState({ status: "error", error: err });
    //   },
    // });

    return () => {
      stopListenForUserAndDocumentChanges();
      stopListenForSessionChanges();
      // isClosed = true;
      // client.close();
    };
  }, [options, setState]);

  return state;
}

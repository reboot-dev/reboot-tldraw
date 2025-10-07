import { Authority } from "../../../api/rbt/thirdparty/tldraw/v1/authority_rbt.js";
import { Checkpoint } from "../../../api/rbt/thirdparty/tldraw/v1/checkpoint_rbt.js";
import {
  ReaderContext,
  WriterContext,
  TransactionContext,
  WorkflowContext,
  allow,
  until,
} from "@reboot-dev/reboot";
import { assert, errors_pb } from "@reboot-dev/reboot-api";
import { SortedMap } from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
import { createTLStore } from "@tldraw/editor";
import { type RecordsDiff, squashRecordDiffs } from "@tldraw/store";
import { type TLStore, type TLStoreSnapshot } from "@tldraw/tlschema";
import { z } from "zod/v4";

const encode = (value: any): Uint8Array => {
  return new TextEncoder().encode(JSON.stringify(value));
};

const decode = (bytes: Uint8Array) => {
  return JSON.parse(new TextDecoder().decode(bytes));
};

export class AuthorityServicer extends Authority.Servicer {
  #cache?: { store: TLStore; version: number };

  authorizer() {
    return allow();
  }

  private async cache(
    context: ReaderContext | WriterContext | TransactionContext
  ) {
    // If we don't have a cached store or we recently took a
    // checkpoint and the store is now out of date, fetch the latest.
    if (!this.#cache || this.#cache.version < this.state.version) {
      const { snapshot, version } = await this.#checkpoint.latest(context);
      const store = createTLStore({});
      if (snapshot) {
        store.loadStoreSnapshot(snapshot);
      }
      this.#cache = { store, version };
    }

    // Apply the latest diffs to the store if necessary.
    let { store, version } = this.#cache;

    // Invariant is that `version` should never be less than
    // `this.state.version` because we should have always fetched the
    // latest above.
    assert(version >= this.state.version);

    // Check for any diffs that we should be applying.
    if (version < this.state.version + this.state.diffs.length) {
      const diffs = this.state.diffs.slice(version - this.state.version);
      assert(diffs.length > 0);

      const diff: RecordsDiff = squashRecordDiffs(diffs);

      store.mergeRemoteChanges(() => {
        store.applyDiff(diff);
      });

      this.#cache = { store, version: version + diffs.length };
    }

    return this.#cache;
  }

  async create(
    context: TransactionContext,
    request: Authority.CreateRequest
  ): Promise<Authority.CreateResponse> {
    // Call `update()` without any commits to ensure the checkpoint
    // has been created so we can safely call `latest()`.
    await this.#checkpoint.update(context);

    const { store, version } = await this.cache(context);

    return { snapshot: store.getStoreSnapshot(), version };
  }

  async apply(
    context: WriterContext,
    request: Authority.ApplyRequest
  ): Promise<void> {
    const { store, version } = await this.cache();

    if (version !== request.version) {
      throw new Authority.ApplyAborted(
        new errors_pb.InvalidArgument(), {
	  message: "Invalid version",
	});
    }

    // If this is the first change we're applying, also schedule
    // the `checkpoint` workflow.
    if (version == 0) {
      await this.ref().schedule().checkpoint(context);
    }

    // TODO: ensure this "throws" if we can't apply these diffs.
    store.mergeRemoteChanges(() => {
      store.applyDiff(squashRecordDiffs(request.diffs));
    });

    // NOTE: we don't update `this.#cache` as that is a side-effect;
    // instead `this.cache()` will correctly return a store based on
    // the latest `state` when ever we need it.
    this.state.diffs = [...this.state.diffs, ...request.diffs];

    return { version: this.state.version + this.state.diffs.length };
  }

  async changes(
    context: ReaderContext,
    { sinceVersion }: Authority.ChangesRequest
  ): Promise<Authority.ChangesResponse> {
    // If the caller asks for a version less than what we have as part
    // of this state, go out to the `SortedMap` and get what they need.
    if (sinceVersion < this.state.version) {
      // TODO: support just sending the current snapshot if the number
      // of changes they need is greater than some value, e.g., 1000.
      const { entries } = await this.#diffs.range(context, {
        startKey: sinceVersion.toString().padStart(20, "0"),
        limit: this.state.version - sinceVersion,
      });

      const diffs = entries.map(({ value }) => decode(value));

      return {
        diffs: [...diffs, ...this.state.diffs],
      };
    }

    if (sinceVersion > this.state.version + this.state.diffs.length) {
      throw new Authority.ChangesAborted(new errors_pb.InvalidArgument());
    }

    return {
      diffs: this.state.diffs.slice(sinceVersion - this.state.version),
    };
  }

  async checkpoint(
    context: WorkflowContext,
    request: Authority.CheckpointRequest
  ): Promise<void> {
    // Control loop which checkpoints after accumulating 100 diffs.
    for await (const iteration of context.loop("Checkpoint")) {
      let { diffs, version } = await until(
        `At least 100 diffs accumulated`,
        context,
        async () => {
          const { diffs, version } = await this.ref().read(context);
          return diffs.length >= 100 && { diffs, version };
        },
        { schema: z.object({ diffs: z.array(z.json()), version: z.number() }) }
      );

      // 1. Save the changes out to a `SortedMap` so that we can
      // still send just steps to clients that are behind.
      const entries = {};
      for (const diff of diffs) {
        entries[version.toString().padStart(20, "0")] = encode(diff);
        version += 1;
      }
      await this.#diffs.insert(context, { entries });

      // 2. Apply the steps to the checkpoint. We need to do this
      // first so that if we get rebooted before 2. we'll just fetch
      // the latest checkpoint and apply only the relevant changes (if
      // any) from `state.changes`. Alternatively we could update
      // `state` and update the checkpoint in a transaction.
      await this.#checkpoint.update(context, { diffs });

      // 3. Truncate the changes and update the version.
      await this.ref().write(context, async (state) => {
        state.diffs = state.diffs.slice(diffs.length);
        state.version += diffs.length;
      });
    }
  }

  get #checkpoint() {
    // Using relative naming here, `Checkpoint` instance has same name
    // as this instance of `Authority`.
    return Checkpoint.ref(this.ref().stateId);
  }

  get #diffs() {
    // Using relative naming here, `SortedMap` instance has same name
    // as this instance of `Authority`.
    return SortedMap.ref(this.ref().stateId);
  }
}

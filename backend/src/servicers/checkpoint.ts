import { Checkpoint } from "../../../api/rbt/thirdparty/tldraw/v1/checkpoint_rbt.js";
import { ReaderContext, WriterContext, allow } from "@reboot-dev/reboot";
import { assert } from "@reboot-dev/reboot-api";
import { createTLStore } from "@tldraw/editor";
import { type RecordsDiff, squashRecordDiffs } from "@tldraw/store";

export class CheckpointServicer extends Checkpoint.Servicer {
  authorizer() {
    return allow();
  }

  async latest(
    context: ReaderContext,
    request: Checkpoint.LatestRequest
  ): Promise<Checkpoint.LatestResponse> {
    return {
      snapshot: this.state.snapshot,
      version: this.state.version,
    };
  }

  async update(
    context: WriterContext,
    { diffs }: Checkpoint.UpdateRequest
  ): Promise<void> {
    const store = createTLStore({});

    if (this.state.snapshot) {
      store.loadStoreSnapshot(this.state.snapshot);
    }

    if (diffs.length == 0) {
      return;
    }

    const diff: RecordsDiff = squashRecordDiffs(diffs);

    store.mergeRemoteChanges(() => {
      store.applyDiff(diff);
    });

    this.state.snapshot = store.getStoreSnapshot();
    this.state.version += diffs.length;
  }
}

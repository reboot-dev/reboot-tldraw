import { z } from "zod/v4";

export const api = {
  Authority: {
    state: {
      // Array of `RecordsDiff` from '@tldraw/store'.
      diffs: z.array(z.json()).default(() => []).meta({ tag: 1 }),
      version: z.number().default(0).meta({ tag: 2 }),
    },

    methods: {
      create: {
        kind: "transaction",
        request: {},
        response: {
          // A `StoreSnapshot` from '@tldraw/store'.
          snapshot: z.json().optional().meta({ tag: 1 }),
          version: z.number().meta({ tag: 2 }),
        },
      },
      apply: {
        kind: "writer",
        request: {
          // A `NetworkDiff` from '@tldraw/sync-core'.
          diff: z.json().meta({ tag: 1 }),
          version: z.number().meta({ tag: 2 }),
        },
        response: {
          version: z.number().meta({ tag: 1 }),
        },
      },
      changes: {
        kind: "reader",
        request: {
          sinceVersion: z.number().meta({ tag: 1 }),
        },
        response: {
          // Array of `NetworkDiff` from '@tldraw/sync-core'.
          diffs: z.array(z.json()).meta({ tag: 1 }),
        },
      },
      // Internal `workflow`, not intended to get called externally.
      checkpoint: {
        kind: "workflow",
        request: {},
        response: {},
      },
    },
  },
};

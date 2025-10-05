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
          snapshot: z.json().meta({ tag: 1 }),
          version: z.number().meta({ tag: 2 }),
        },
      },
      apply: {
        kind: "writer",
        request: {
          // A `RecordsDiff` from '@tldraw/store'.
          diffs: z.json().meta({ tag: 1 }),
          version: z.number().meta({ tag: 2 }),
        },
        response: z.void(),
      },
      changes: {
        kind: "reader",
        request: {
          sinceVersion: z.number().meta({ tag: 1 }),
        },
        response: {
          // A `RecordsDiff` from '@tldraw/store'.
          diffs: z.json().meta({ tag: 1 }),
        },
      },
    },
  },
};

import { z } from "zod/v4";

export const api = {
  Checkpoint: {
    state: {
      // A `StoreSnapshot` from '@tldraw/store'.
      snapshot: z.json().meta({ tag: 1 }),
      version: z.number().meta({ tag: 2 }),
    },

    methods: {
      latest: {
        kind: "reader",
        request: {},
        response: {
          // A `StoreSnapshot` from '@tldraw/store'.
          snapshot: z.json().meta({ tag: 1 }),
          version: z.number().meta({ tag: 2 }),
        },
      },
      update: {
        kind: "writer",
        request: {
          // A `RecordsDiff` from '@tldraw/store'.
          diffs: z.json().meta({ tag: 1 }),
          version: z.number().meta({ tag: 2 }),
        },
        response: z.void(),
      },
    },
  },
};

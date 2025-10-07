import { z } from "zod/v4";

export const api = {
  Checkpoint: {
    state: {
      // A `StoreSnapshot` from '@tldraw/store'.
      snapshot: z.json().optional().meta({ tag: 1 }),
      version: z.number().default(0).meta({ tag: 2 }),
    },

    methods: {
      latest: {
        kind: "reader",
        request: {},
        response: {
          // A `StoreSnapshot` from '@tldraw/store'.
          snapshot: z.json().optional().meta({ tag: 1 }),
          version: z.number().meta({ tag: 2 }),
        },
      },
      update: {
        kind: "writer",
        request: {
          // Array of `RecordsDiff` from '@tldraw/store'.
          diffs: z.array(z.json()).default(() => []).meta({ tag: 1 }),
        },
        response: z.void(),
      },
    },
  },
};

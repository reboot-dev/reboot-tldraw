import { Authority } from "../../api/rbt/thirdparty/tldraw/v1/authority_rbt.js";
// import { PERSISTENCE_KEY } from "../../common/constants.js";
import { Application } from "@reboot-dev/reboot";
import sortedMap from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
import { AuthorityServicer } from "./servicers/authority.js";
import { CheckpointServicer } from "./servicers/checkpoint.js";

const initialize = async (context) => {
  // Ensure the doc has been constructed.
  // await Authority.ref(DOC_ID).create(context);
};

export const servicers = [
  AuthorityServicer,
  CheckpointServicer,
  ...sortedMap.servicers(),
];

new Application({ servicers, initialize }).run();

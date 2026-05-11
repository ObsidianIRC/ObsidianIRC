export { buildIframeSrc, disposeBlobs, type LoadedXdc } from "./loader";
export {
  getInstanceUpdates,
  handleInboundUpdate,
  handleOutboundUpdate,
  markInstanceReady,
  registerInstance,
  unregisterInstance,
  type WebxdcUpdate,
} from "./manager";
export { buildShimSource, type ShimInit } from "./shim";
export { disposeBundle, fetchAndUnzipXdc, type XdcBundle } from "./unzip";

import ircClient from "../ircClient";

export interface WebxdcUpdate {
  payload: unknown;
  serial: number;
  info?: string;
  summary?: string;
  document?: string;
  href?: string;
  sender: string;
}

interface InstanceState {
  serverId: string;
  channel: string;
  iframe: HTMLIFrameElement | null;
  // ready=true once the iframe has fired `load` and the inline shim's message
  // listener is attached. Posting before this drops on the floor — the browser
  // does not queue postMessages for a contentWindow whose document is mid-parse.
  ready: boolean;
  // updates we've seen on the wire, sorted by serial+sender. Replayed to the
  // iframe once it becomes ready, then deduped by (serial, sender).
  updates: WebxdcUpdate[];
  outboundSerial: number;
}

const instances = new Map<string, InstanceState>();

export function registerInstance(
  instanceId: string,
  serverId: string,
  channel: string,
  iframe: HTMLIFrameElement,
): void {
  const existing = instances.get(instanceId);
  if (existing) {
    existing.iframe = iframe;
    existing.serverId = serverId;
    existing.channel = channel;
    existing.ready = false;
    return;
  }
  instances.set(instanceId, {
    serverId,
    channel,
    iframe,
    ready: false,
    updates: [],
    outboundSerial: 0,
  });
}

export function unregisterInstance(instanceId: string): void {
  const inst = instances.get(instanceId);
  if (inst) {
    inst.iframe = null;
    inst.ready = false;
  }
}

// Called by MediaPreview after iframe.onload fires. The inline shim's message
// listener is guaranteed attached by then, so posting works.
export function markInstanceReady(instanceId: string): void {
  const inst = instances.get(instanceId);
  if (!inst?.iframe?.contentWindow) return;
  inst.ready = true;
  for (const update of inst.updates) {
    inst.iframe.contentWindow.postMessage(
      { __webxdc: true, instance: instanceId, kind: "update", update },
      "*",
    );
  }
}

// Called by iframe shim via postMessage when app calls webxdc.sendUpdate.
export function handleOutboundUpdate(
  instanceId: string,
  payload: unknown,
  descr: string,
): void {
  const inst = instances.get(instanceId);
  if (!inst) return;
  inst.outboundSerial++;
  let payloadJson: string;
  try {
    payloadJson = JSON.stringify(payload);
  } catch {
    console.error("webxdc: payload not JSON-serializable");
    return;
  }
  const b64 = btoa(unescape(encodeURIComponent(payloadJson)));
  if (b64.length > 3000) {
    console.warn("webxdc: update exceeds IRC tag budget, skipping");
    return;
  }
  ircClient.sendTagmsg(inst.serverId, inst.channel, {
    "+webxdc/instance": instanceId,
    "+webxdc/serial": String(inst.outboundSerial),
    "+webxdc/payload": b64,
    "+webxdc/descr": descr.slice(0, 100),
  });
}

// Called by store TAGMSG handler when a +webxdc/* tagged message arrives.
export function handleInboundUpdate(
  instanceId: string,
  serial: number,
  payloadB64: string,
  sender: string,
): void {
  let payload: unknown;
  try {
    payload = JSON.parse(decodeURIComponent(escape(atob(payloadB64))));
  } catch {
    return;
  }
  const update: WebxdcUpdate = { payload, serial, sender };
  let inst = instances.get(instanceId);
  if (!inst) {
    // Update arrived before iframe registered. Buffer; will be replayed when
    // the local user opens the .xdc and the iframe becomes ready.
    inst = {
      serverId: "",
      channel: "",
      iframe: null,
      ready: false,
      updates: [update],
      outboundSerial: 0,
    };
    instances.set(instanceId, inst);
    return;
  }
  if (inst.updates.some((u) => u.serial === serial && u.sender === sender)) {
    return;
  }
  inst.updates.push(update);
  inst.updates.sort((a, b) => a.serial - b.serial);
  if (inst.ready && inst.iframe?.contentWindow) {
    inst.iframe.contentWindow.postMessage(
      { __webxdc: true, instance: instanceId, kind: "update", update },
      "*",
    );
  }
}

export function getInstanceUpdates(instanceId: string): WebxdcUpdate[] {
  return instances.get(instanceId)?.updates ?? [];
}

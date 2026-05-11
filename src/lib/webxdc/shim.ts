// The shim runs INSIDE the sandboxed iframe. Exposes window.webxdc with the
// API surface needed for collaborative apps (sendUpdate / setUpdateListener /
// sendToChat / importFiles), with nested-app / deep-link / storage paths
// removed.
//
// Hardening summary:
// - update.info / update.summary / update.document / update.href are all
//   dropped before crossing the iframe boundary. Apps cannot influence the
//   chat UI, set notification text, or trigger deep-link navigation via
//   update.href (spec feature; intentionally blocked here).
// - getAllUpdates is a deprecated-and-stubbed no-op.
// - joinRealtimeChannel returns a no-op listener; ephemeral realtime is not
//   wired to a transport yet.
// - localStorage / sessionStorage / indexedDB are not supported here because
//   the iframe runs with sandbox="allow-scripts" only — opaque origin throws
//   SecurityError on storage APIs. Apps that need state replay should rely
//   on the update log via setUpdateListener.

export interface ShimInit {
  instanceId: string;
  selfAddr: string;
  selfName: string;
  sendUpdateMaxSize: number;
  sendUpdateInterval: number;
}

export function buildShimSource(init: ShimInit): string {
  return `(function() {
  var INSTANCE = ${JSON.stringify(init.instanceId)};
  var listener = null;
  var listenerSerial = 0;
  var queue = [];
  var maxSerial = 0;
  var resolveListenerPromise = null;

  function deliverPending() {
    if (!listener) return;
    var pending = queue.filter(function(u) { return u.serial > listenerSerial; });
    if (pending.length === 0) return;
    pending.sort(function(a, b) { return a.serial - b.serial; });
    for (var i = 0; i < pending.length; i++) {
      var u = pending[i];
      try { listener(u); } catch (e) { console.error("webxdc listener:", e); }
      listenerSerial = u.serial;
    }
    if (resolveListenerPromise) {
      var r = resolveListenerPromise;
      resolveListenerPromise = null;
      r();
    }
  }

  window.addEventListener("message", function(ev) {
    var data = ev.data;
    if (!data || data.__webxdc !== true || data.instance !== INSTANCE) return;
    if (data.kind !== "update") return;
    if (data.update.serial > maxSerial) maxSerial = data.update.serial;
    data.update.max_serial = maxSerial;
    for (var i = 0; i < queue.length; i++) queue[i].max_serial = maxSerial;
    queue.push(data.update);
    deliverPending();
  });

  // No-op realtime stub. Realtime/presence is not wired to a transport.
  function makeRealtimeStub() {
    var trashed = false;
    return {
      setListener: function() {},
      send: function() {},
      leave: function() { trashed = true; },
      is_trashed: function() { return trashed; }
    };
  }

  window.webxdc = {
    selfAddr: ${JSON.stringify(init.selfAddr)},
    selfName: ${JSON.stringify(init.selfName)},
    sendUpdateMaxSize: ${init.sendUpdateMaxSize},
    sendUpdateInterval: ${init.sendUpdateInterval},

    sendUpdate: function(update, descr) {
      // App-facing API: { payload, info?, summary?, document?, href? }.
      // We send only the raw payload over the wire. info/summary/document/href
      // are dropped — no chat-UI side-effects, no deep-link surface.
      var rawPayload = (update && typeof update === "object" && "payload" in update)
        ? update.payload
        : update;
      window.parent.postMessage({
        __webxdc: true, instance: INSTANCE, kind: "sendUpdate",
        payload: rawPayload,
        descr: typeof descr === "string" ? descr.slice(0, 200) : ""
      }, "*");
    },

    setUpdateListener: function(cb, serial) {
      listener = cb;
      listenerSerial = serial || 0;
      return new Promise(function(resolve) {
        resolveListenerPromise = resolve;
        if (queue.some(function(u) { return u.serial > listenerSerial; })) {
          deliverPending();
        } else {
          // Resolve on next tick if nothing queued — matches "caught up" semantic
          setTimeout(function() {
            if (resolveListenerPromise) {
              var r = resolveListenerPromise;
              resolveListenerPromise = null;
              r();
            }
          }, 0);
        }
      });
    },

    getAllUpdates: function() {
      console.warn("[webxdc] getAllUpdates() is deprecated; use setUpdateListener");
      return Promise.resolve([]);
    },

    sendToChat: function(content) {
      // Forward to parent which posts a PRIVMSG to the channel. Parent
      // enforces size limits and rejects file-only payloads (file transport
      // not implemented).
      if (!content || (typeof content !== "object")) {
        return Promise.reject(new Error("sendToChat: content required"));
      }
      window.parent.postMessage({
        __webxdc: true, instance: INSTANCE, kind: "sendToChat",
        text: typeof content.text === "string" ? content.text : null
      }, "*");
      return Promise.resolve();
    },

    importFiles: function(filters) {
      // Open the iframe's own file picker. Sandbox doesn't block <input type=file>.
      var element = document.createElement("input");
      element.type = "file";
      var f = filters || {};
      element.accept = [].concat(f.extensions || [], f.mimeTypes || []).join(",");
      element.multiple = !!f.multiple;
      var promise = new Promise(function(resolve) {
        element.onchange = function() {
          var files = Array.from(element.files || []);
          document.body.removeChild(element);
          resolve(files);
        };
      });
      element.style.display = "none";
      document.body.appendChild(element);
      element.click();
      return promise;
    },

    joinRealtimeChannel: makeRealtimeStub
  };
})();`;
}

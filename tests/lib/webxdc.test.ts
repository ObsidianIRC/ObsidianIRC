import { describe, expect, test } from "vitest";
import {
  detectMediaType,
  extractMediaFromMessage,
} from "../../src/lib/mediaUtils";
import { renderXdcHtml } from "../../src/lib/webxdc/loader";
import { buildShimSource } from "../../src/lib/webxdc/shim";
import type { XdcBundle } from "../../src/lib/webxdc/unzip";
import type { Message } from "../../src/types";

describe("webxdc media detection", () => {
  test("detects .xdc extension as webxdc", () => {
    expect(detectMediaType("https://files/poll.xdc")).toBe("webxdc");
    expect(detectMediaType("https://files/POLL.XDC")).toBe("webxdc");
    expect(detectMediaType("https://files/checklist.xdc?v=1")).toBe("webxdc");
  });

  test("non-.xdc URLs are unaffected", () => {
    expect(detectMediaType("https://files/foo.zip")).toBe(null);
    expect(detectMediaType("https://files/foo.png")).toBe("image");
  });
});

describe("+webxdc/app tag overrides type detection", () => {
  function msg(content: string, tags?: Record<string, string>): Message {
    return {
      id: "m1",
      content,
      timestamp: new Date(),
      userId: "u",
      channelId: "c",
      serverId: "s",
      type: "message",
      reactions: [],
      replyMessage: null,
      mentioned: [],
      tags,
    };
  }

  test("tag matching a body URL forces type webxdc even if extension hints zip", () => {
    const url = "https://s.h4ks.com/HJO.xdc";
    const entries = extractMediaFromMessage(
      msg(`Here's your game: ${url}`, { "+webxdc/app": url }),
    );
    const hit = entries.find((e) => e.url === url);
    expect(hit?.type).toBe("webxdc");
  });

  test("tag URL not in body is injected as a new entry", () => {
    const url = "https://files/abc";
    const entries = extractMediaFromMessage(
      msg("Check this out", { "+webxdc/app": url }),
    );
    expect(entries[0]).toEqual({ url, type: "webxdc" });
  });

  test("no tag — extension-less URL stays type:null for probing", () => {
    const entries = extractMediaFromMessage(msg("https://files/abc"));
    expect(entries[0].type).toBe(null);
  });

  test("tag overrides body-type detection (image extension still treated as webxdc)", () => {
    const url = "https://files/foo.png";
    const entries = extractMediaFromMessage(msg(url, { "+webxdc/app": url }));
    const hit = entries.find((e) => e.url === url);
    expect(hit?.type).toBe("webxdc");
  });
});

function makeBundle(html: string): XdcBundle {
  return {
    files: { "index.html": new TextEncoder().encode(html) },
    manifest: {},
  };
}

function shimFor(id: string): string {
  return buildShimSource({
    instanceId: id,
    selfAddr: "alice",
    selfName: "alice",
    sendUpdateMaxSize: 3000,
    sendUpdateInterval: 1000,
  });
}

describe("webxdc loader CSP enforcement", () => {
  test("injects CSP meta with connect-src 'none' to block network access", () => {
    const html = renderXdcHtml(
      makeBundle("<html><head></head><body></body></html>"),
      shimFor("x"),
      new Map(),
    );
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("frame-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("object-src 'none'");
  });

  test("CSP appears before user scripts in <head>", () => {
    const html = renderXdcHtml(
      makeBundle(
        "<html><head><script>evil()</script></head><body></body></html>",
      ),
      shimFor("x"),
      new Map(),
    );
    const cspIdx = html.indexOf("Content-Security-Policy");
    const userScriptIdx = html.indexOf("evil()");
    expect(cspIdx).toBeGreaterThan(-1);
    expect(userScriptIdx).toBeGreaterThan(-1);
    expect(cspIdx).toBeLessThan(userScriptIdx);
  });

  test("rewrites relative asset URLs but leaves http(s) and data alone", () => {
    const html = renderXdcHtml(
      makeBundle(
        '<html><head></head><body><img src="./logo.png"><img src="https://cdn/x.png"><img src="data:image/png;base64,x"></body></html>',
      ),
      shimFor("x"),
      new Map([["logo.png", "blob:fake-1"]]),
    );
    expect(html).toContain('src="blob:fake-1"');
    expect(html).toContain('src="https://cdn/x.png"');
    expect(html).toContain('src="data:image/png;base64,x"');
  });
});

describe("webxdc end-to-end pipeline (poll-shaped synthetic bundle)", () => {
  // Build a bundle with the same shape as webxdc/poll: manifest.toml, index.html
  // referencing webxdc.js, and an icon. Verifies manifest data + asset rewriting
  // + shim/CSP injection on a realistic input.
  // Note: fflate's browser ESM build is loaded under jsdom and behaves
  // differently from the node build for zip round-trips. We skip the actual
  // zip pack/unpack step here and assert the pipeline starting from the bundle.
  function pollLikeBundle(): XdcBundle {
    const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <script src="webxdc.js"></script>
</head><body>
  <img src="icon.png" alt="logo">
  <h1>Poll</h1>
  <script>
    window.webxdc.setUpdateListener(function(u){
      console.log("update", u);
    }, 0);
  </script>
</body></html>`;
    return {
      files: {
        "manifest.toml": new TextEncoder().encode(
          'name = "TestPoll"\nsource_code_url = "https://example.com/poll"\nmin_api = 1',
        ),
        "index.html": new TextEncoder().encode(html),
        "icon.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      },
      manifest: { name: "TestPoll" },
    };
  }

  test("renderXdcHtml on poll-shaped bundle injects CSP, shim, rewrites assets", () => {
    const bundle = pollLikeBundle();
    const pathToUrl = new Map([
      ["icon.png", "blob:icon"],
      ["webxdc.js", "blob:shim-noop"],
    ]);
    const html = renderXdcHtml(bundle, shimFor("instance-1"), pathToUrl);

    // CSP comes first, before any user script
    const cspIdx = html.indexOf("Content-Security-Policy");
    const userScriptIdx = html.indexOf("setUpdateListener");
    expect(cspIdx).toBeGreaterThan(-1);
    expect(cspIdx).toBeLessThan(userScriptIdx);

    // Asset rewriting hit both <script src="webxdc.js"> and <img src="icon.png">
    expect(html).toContain('src="blob:icon"');
    expect(html).toContain('src="blob:shim-noop"');

    // Shim was injected inline so window.webxdc is set before user script runs
    expect(html).toContain("window.webxdc");
    expect(html).toContain("instance-1");

    // Original relative paths no longer present as script/img sources
    expect(html).not.toMatch(/src="webxdc\.js"/);
    expect(html).not.toMatch(/src="icon\.png"/);
  });

  test("shim source includes spec-required surface", () => {
    const shim = shimFor("inst-x");
    expect(shim).toContain("sendUpdate");
    expect(shim).toContain("setUpdateListener");
    expect(shim).toContain("selfAddr");
    expect(shim).toContain("selfName");
    expect(shim).toContain("max_serial");
    expect(shim).toContain("getAllUpdates");
    expect(shim).toContain("sendToChat");
    expect(shim).toContain("importFiles");
    expect(shim).toContain("joinRealtimeChannel");
  });

  test("manifest text in bundle exposes name and source_code_url for parsing", () => {
    const bundle = pollLikeBundle();
    const toml = new TextDecoder().decode(bundle.files["manifest.toml"]);
    expect(toml).toContain('name = "TestPoll"');
    expect(toml).toContain("source_code_url");
  });
});

describe("webxdc manager replay + dedup", () => {
  test("duplicate (serial, sender) on inbound is ignored", async () => {
    const { handleInboundUpdate, getInstanceUpdates, registerInstance } =
      await import("../../src/lib/webxdc/manager");
    const id = `test-${Math.random()}`;
    // Register first so updates land in an initialized instance
    const fakeIframe = document.createElement("iframe");
    registerInstance(id, "srv", "#chan", fakeIframe);

    const payload = btoa(JSON.stringify({ vote: "yes" }));
    handleInboundUpdate(id, 1, payload, "alice");
    handleInboundUpdate(id, 1, payload, "alice"); // duplicate
    handleInboundUpdate(id, 2, payload, "alice");
    handleInboundUpdate(id, 1, payload, "bob"); // same serial, different sender — kept

    const updates = getInstanceUpdates(id);
    expect(updates.length).toBe(3);
    expect(updates.map((u) => `${u.sender}:${u.serial}`).sort()).toEqual([
      "alice:1",
      "alice:2",
      "bob:1",
    ]);
  });

  test("inbound updates before iframe registration are buffered", async () => {
    const { handleInboundUpdate, getInstanceUpdates } = await import(
      "../../src/lib/webxdc/manager"
    );
    const id = `pre-${Math.random()}`;
    const payload = btoa(JSON.stringify({ x: 1 }));
    handleInboundUpdate(id, 5, payload, "alice");
    handleInboundUpdate(id, 6, payload, "bob");

    const updates = getInstanceUpdates(id);
    expect(updates.length).toBe(2);
  });
});

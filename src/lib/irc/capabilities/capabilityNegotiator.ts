import type { StateManager } from "../core/state";
import type { EventEmitter } from "../events/eventEmitter";

export class CapabilityNegotiator {
  private eventEmitter: EventEmitter;
  private stateManager: StateManager;
  private sendRaw: (serverId: string, data: string) => void;
  private userOnConnect: (serverId: string) => void;

  private readonly supportedCapabilities: string[] = [
    "multi-prefix",
    "message-tags",
    "server-time",
    "echo-message",
    "userhost-in-names",
    "draft/chathistory",
    "draft/extended-isupport",
    "sasl",
    "cap-notify",
    "draft/channel-rename",
    "setname",
    "account-notify",
    "account-tag",
    "extended-join",
    "away-notify",
    "batch",
    "invite-notify",
    "chghost",
    "labeled-response",
    "multiline",
    "redact",
  ];

  private capLsAccumulated: Map<string, Set<string>> = new Map();
  private pendingCapReqs: Map<string, number> = new Map();
  private saslMechanisms: Map<string, string[]> = new Map();

  constructor(
    eventEmitter: EventEmitter,
    stateManager: StateManager,
    sendRaw: (serverId: string, data: string) => void,
    userOnConnect: (serverId: string) => void,
  ) {
    this.eventEmitter = eventEmitter;
    this.stateManager = stateManager;
    this.sendRaw = sendRaw;
    this.userOnConnect = userOnConnect;
  }

  handleCapLs(serverId: string, cliCaps: string, isFinal: boolean): void {
    let accumulated = this.capLsAccumulated.get(serverId);
    if (!accumulated) {
      accumulated = new Set();
      this.capLsAccumulated.set(serverId, accumulated);
    }

    const caps = cliCaps.split(" ");
    for (const c of caps) {
      const [cap, value] = c.split("=", 2);
      accumulated.add(cap);

      if (cap === "sasl" && value) {
        this.saslMechanisms.set(serverId, value.split(","));
      }

      if (cap === "unrealircd.org/link-security" && value) {
        const linkSecurityValue = Number.parseInt(value, 10) || 0;
        this.eventEmitter.triggerEvent("CAP LS", {
          serverId,
          cliCaps: `unrealircd.org/link-security=${linkSecurityValue}`,
        });
      }
    }

    if (isFinal) {
      const capsToRequest: string[] = [];
      const saslEnabled = this.stateManager.isSaslEnabled(serverId);

      for (const cap of accumulated) {
        if (
          (this.supportedCapabilities.includes(cap) ||
            cap.startsWith("draft/metadata")) &&
          (cap !== "sasl" || saslEnabled)
        ) {
          capsToRequest.push(cap);
        }
      }

      if (capsToRequest.length > 0) {
        let currentBatch: string[] = [];
        const baseLength = "CAP REQ :".length + 2;
        let currentLength = baseLength;
        let batchCount = 0;

        for (const cap of capsToRequest) {
          const capLength = cap.length + (currentBatch.length > 0 ? 1 : 0);

          if (currentLength + capLength > 500 && currentBatch.length > 0) {
            this.sendRaw(serverId, `CAP REQ :${currentBatch.join(" ")}`);
            batchCount++;
            currentBatch = [];
            currentLength = baseLength;
          }

          currentBatch.push(cap);
          currentLength += capLength;
        }

        if (currentBatch.length > 0) {
          this.sendRaw(serverId, `CAP REQ :${currentBatch.join(" ")}`);
          batchCount++;
        }

        this.pendingCapReqs.set(serverId, batchCount);

        setTimeout(() => {
          if (this.pendingCapReqs.has(serverId)) {
            this.pendingCapReqs.delete(serverId);
            this.sendRaw(serverId, "CAP END");
            this.stateManager.setCapNegotiationComplete(serverId, true);
            this.userOnConnect(serverId);
          }
        }, 5000);

        if (capsToRequest.includes("draft/extended-isupport")) {
          this.sendRaw(serverId, "ISUPPORT");
        }
      }

      this.capLsAccumulated.delete(serverId);
    }
  }

  handleCapAck(serverId: string, cliCaps: string): void {
    this.eventEmitter.triggerEvent("CAP ACK", { serverId, cliCaps });

    const pendingCount = this.pendingCapReqs.get(serverId) || 0;
    if (pendingCount > 0) {
      const newCount = pendingCount - 1;

      if (newCount === 0) {
        this.pendingCapReqs.delete(serverId);
      } else {
        this.pendingCapReqs.set(serverId, newCount);
      }
    }
  }

  handleCapNew(serverId: string, cliCaps: string): void {
    const caps = cliCaps.split(" ");
    for (const c of caps) {
      const [cap, value] = c.split("=", 2);
      if (cap === "sasl" && value) {
        this.saslMechanisms.set(serverId, value.split(","));
      }
    }
  }

  handleCapDel(serverId: string, cliCaps: string): void {
    const caps = cliCaps.split(" ");
    for (const c of caps) {
      const [cap] = c.split("=", 2);
      if (cap === "sasl") {
        this.saslMechanisms.delete(serverId);
      }
    }
  }

  handleCapNak(serverId: string): void {
    this.sendRaw(serverId, "CAP END");
    this.stateManager.setCapNegotiationComplete(serverId, true);
  }

  getSaslMechanisms(serverId: string): string[] | undefined {
    return this.saslMechanisms.get(serverId);
  }

  isSupported(capability: string): boolean {
    return (
      this.supportedCapabilities.includes(capability) ||
      capability.startsWith("draft/metadata")
    );
  }

  getSupportedCapabilities(): string[] {
    return [...this.supportedCapabilities];
  }
}

import type { EventEmitter } from "../events/eventEmitter";

export interface SaslCredentials {
  username: string;
  password: string;
}

export type SaslMechanism = "PLAIN" | "EXTERNAL" | "SCRAM-SHA-256";

export class SaslAuthenticator {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Used in constructor
  private eventEmitter: EventEmitter;
  private sendRaw: (serverId: string, data: string) => void;
  private credentials: Map<string, SaslCredentials> = new Map();
  private availableMechanisms: Map<string, string[]> = new Map();
  private saslEnabled: Map<string, boolean> = new Map();
  private saslInProgress: Map<string, boolean> = new Map();

  constructor(
    eventEmitter: EventEmitter,
    sendRaw: (serverId: string, data: string) => void,
  ) {
    this.eventEmitter = eventEmitter;
    this.sendRaw = sendRaw;
  }

  setCredentials(serverId: string, username: string, password: string): void {
    this.credentials.set(serverId, { username, password });
    this.saslEnabled.set(serverId, true);
  }

  getCredentials(serverId: string): SaslCredentials | undefined {
    return this.credentials.get(serverId);
  }

  isEnabled(serverId: string): boolean {
    return this.saslEnabled.get(serverId) ?? false;
  }

  setAvailableMechanisms(serverId: string, mechanisms: string[]): void {
    this.availableMechanisms.set(serverId, mechanisms);
  }

  getAvailableMechanisms(serverId: string): string[] | undefined {
    return this.availableMechanisms.get(serverId);
  }

  startAuthentication(
    serverId: string,
    mechanism: SaslMechanism = "PLAIN",
  ): boolean {
    const creds = this.credentials.get(serverId);
    if (!creds) {
      console.warn(`No SASL credentials for server ${serverId}`);
      return false;
    }

    const available = this.availableMechanisms.get(serverId);
    if (available && !available.includes(mechanism)) {
      console.warn(
        `SASL mechanism ${mechanism} not available on server ${serverId}`,
      );
      return false;
    }

    this.saslInProgress.set(serverId, true);
    this.sendRaw(serverId, `AUTHENTICATE ${mechanism}`);
    return true;
  }

  handleAuthenticateResponse(serverId: string, param: string): void {
    if (!this.saslInProgress.get(serverId)) {
      return;
    }

    const creds = this.credentials.get(serverId);
    if (!creds) {
      console.warn(`No SASL credentials for server ${serverId}`);
      this.abortAuthentication(serverId);
      return;
    }

    if (param === "+" || param === ":+") {
      this.sendPlainAuth(serverId, creds);
    }
  }

  private sendPlainAuth(serverId: string, creds: SaslCredentials): void {
    const authString = `${creds.username}\0${creds.username}\0${creds.password}`;
    const base64Auth = this.base64Encode(authString);
    const chunks = this.splitIntoChunks(base64Auth, 400);

    for (const chunk of chunks) {
      this.sendRaw(serverId, `AUTHENTICATE ${chunk}`);
    }

    if (base64Auth.length % 400 === 0 && base64Auth.length > 0) {
      this.sendRaw(serverId, "AUTHENTICATE +");
    }
  }

  handleSuccess(serverId: string): void {
    this.saslInProgress.set(serverId, false);
    console.log(`SASL authentication successful for server ${serverId}`);
  }

  handleFailure(serverId: string, code: string, message: string): void {
    this.saslInProgress.set(serverId, false);
    console.warn(
      `SASL authentication failed for server ${serverId}: ${code} ${message}`,
    );
  }

  abortAuthentication(serverId: string): void {
    this.saslInProgress.set(serverId, false);
    this.sendRaw(serverId, "AUTHENTICATE *");
  }

  clearCredentials(serverId: string): void {
    this.credentials.delete(serverId);
    this.saslEnabled.set(serverId, false);
    this.saslInProgress.set(serverId, false);
  }

  clearMechanisms(serverId: string): void {
    this.availableMechanisms.delete(serverId);
  }

  isInProgress(serverId: string): boolean {
    return this.saslInProgress.get(serverId) ?? false;
  }

  private base64Encode(str: string): string {
    if (typeof btoa !== "undefined") {
      return btoa(str);
    }

    if (typeof Buffer !== "undefined") {
      return Buffer.from(str, "utf-8").toString("base64");
    }

    throw new Error("No base64 encoding method available");
  }

  private splitIntoChunks(str: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += chunkSize) {
      chunks.push(str.substring(i, i + chunkSize));
    }
    return chunks.length > 0 ? chunks : [""];
  }
}

export type layoutColumn = "serverList" | "chatView" | "memberList";

export interface ConnectionDetails {
  name: string;
  host: string;
  port: string;
  nickname: string;
  useIrcProtocol?: boolean;
  ui?: {
    disableServerConnectionInfo?: boolean;
    hideServerInfo?: boolean;
    hideClose?: boolean;
    title?: string;
  };
}

type layoutColumn = "serverList" | "chatView" | "memberList";

interface ConnectionDetails {
  name: string;
  host: string;
  port: string;
  nickname: string;
  ui?: {
    disableServerConnectionInfo?: boolean;
    hideServerInfo?: boolean;
    hideClose?: boolean;
    title?: string;
  };
}

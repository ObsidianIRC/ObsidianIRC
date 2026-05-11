export function getNickFromNuh(nuh: string): string {
  const nick = nuh.split("!")[0];
  return nick.startsWith(":") ? nick.substring(1) : nick;
}

export function getUserFromNuh(nuh: string): string {
  const withoutColon = nuh.startsWith(":") ? nuh.substring(1) : nuh;
  const afterBang = withoutColon.split("!")[1] ?? "";
  return afterBang.split("@")[0];
}

export function getHostFromNuh(nuh: string): string {
  const withoutColon = nuh.startsWith(":") ? nuh.substring(1) : nuh;
  return withoutColon.split("@")[1] ?? "";
}

export function getTimestampFromTags(
  mtags: Record<string, string> | undefined,
): Date {
  if (mtags?.time) {
    return new Date(mtags.time);
  }
  return new Date();
}

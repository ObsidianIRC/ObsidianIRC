export function getNickFromNuh(nuh: string): string {
  const nick = nuh.split("!")[0];
  return nick.startsWith(":") ? nick.substring(1) : nick;
}

export function getTimestampFromTags(
  mtags: Record<string, string> | undefined,
): Date {
  if (mtags?.time) {
    return new Date(mtags.time);
  }
  return new Date();
}

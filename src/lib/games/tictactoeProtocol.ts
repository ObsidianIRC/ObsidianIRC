// IRC message-tag value escape per IRCv3 message-tags spec.  Used to safely
// embed JSON payloads inside the `+kiwiirc.com/ttt` tag.

export function escapeTagValue(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\:")
    .replace(/ /g, "\\s")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

export function unescapeTagValue(v: string): string {
  let out = "";
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c !== "\\" || i + 1 >= v.length) {
      out += c;
      continue;
    }
    const next = v[++i];
    if (next === ":") out += ";";
    else if (next === "s") out += " ";
    else if (next === "r") out += "\r";
    else if (next === "n") out += "\n";
    else if (next === "\\") out += "\\";
    else out += next;
  }
  return out;
}

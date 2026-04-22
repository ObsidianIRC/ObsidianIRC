import { describe, expect, test } from "vitest";
import { parseIsupport, parseMessageTags } from "../../src/lib/ircUtils";

describe("parseMessageTags", () => {
  test("unescapes IRCv3 message tag values without trimming meaningful data", () => {
    expect(parseMessageTags("@+example=raw+:=,escaped\\:\\s\\\\")).toEqual({
      "+example": "raw+:=,escaped; \\",
    });
  });

  test("preserves everything after the first equals sign in a tag value", () => {
    expect(parseMessageTags("@foo=a=b=c")).toEqual({
      foo: "a=b=c",
    });
  });

  test("treats empty and missing values as empty strings", () => {
    expect(parseMessageTags("@foo;bar=")).toEqual({
      foo: "",
      bar: "",
    });
  });

  test("drops invalid escape backslashes and trailing lone backslashes per spec", () => {
    expect(parseMessageTags("@foo=\\b;bar=test\\")).toEqual({
      foo: "b",
      bar: "test",
    });
  });
});

describe("parseIsupport", () => {
  test("preserves everything after the first equals sign in token values", () => {
    expect(
      parseIsupport("EXAMPLE=foo=bar CLIENTTAGDENY=*,-draft/react"),
    ).toEqual({
      EXAMPLE: "foo=bar",
      CLIENTTAGDENY: "*,-draft/react",
    });
  });

  test("unescapes spaces encoded as \\x20 in token values", () => {
    expect(parseIsupport("NETWORK=Test\\x20Network CASEMAPPING")).toEqual({
      NETWORK: "Test Network",
      CASEMAPPING: "",
    });
  });
});

import { i18n } from "@lingui/core";
import React from "react";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  return children as React.ReactElement;
}

// Interpolate text placeholders: "Hello {name}" → "Hello World"
function interpolateText(
  template: string,
  values?: Record<string, unknown>,
): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    String(values[key] ?? `{${key}}`),
  );
}

// Parse a lingui message template with component placeholders (<0>...</0>)
// and text interpolations ({key}), returning React nodes.
function renderTemplate(
  template: string,
  values?: Record<string, unknown>,
  components?: Record<string | number, React.ReactElement>,
): React.ReactNode {
  if (!components || Object.keys(components).length === 0) {
    return interpolateText(template, values);
  }

  // Split on component tags like <0>...</0>, <1>...</1>
  const segments = template.split(/(<\d+>[\s\S]*?<\/\d+>)/g);
  const nodes: React.ReactNode[] = segments.map((seg, i) => {
    const match = seg.match(/^<(\d+)>([\s\S]*?)<\/\1>$/);
    if (match && components) {
      const idx = match[1];
      const inner = interpolateText(match[2], values);
      const comp = components[idx] ?? components[Number(idx)];
      if (comp) {
        // biome-ignore lint/suspicious/noArrayIndexKey: template segments are stable positional keys
        return React.cloneElement(comp, { key: i }, inner);
      }
    }
    return interpolateText(seg, values);
  });

  return React.createElement(React.Fragment, null, ...nodes);
}

// Babel compiles <Trans>text <Elem>{var}</Elem></Trans> to
// <Trans id="..." message="..." values={{var}} components={{0:<Elem/>}} />
export function Trans({
  children,
  message,
  id,
  values,
  components,
}: {
  children?: React.ReactNode;
  message?: string;
  id?: string;
  values?: Record<string, unknown>;
  components?: Record<string | number, React.ReactElement>;
}) {
  const template = message ?? id;
  if (template) {
    return React.createElement(
      React.Fragment,
      null,
      renderTemplate(template, values, components),
    );
  }
  return React.createElement(React.Fragment, null, children);
}

type MessageDescriptor = {
  id?: string;
  message?: string;
  values?: Record<string, unknown>;
};

// Returns the message string from a lingui MessageDescriptor or plain string
function resolveMessage(descriptor: string | MessageDescriptor): string {
  if (typeof descriptor === "string") return descriptor;
  const template = descriptor?.message ?? descriptor?.id ?? "";
  if (descriptor?.values && Object.keys(descriptor.values).length > 0) {
    return interpolateText(template, descriptor.values);
  }
  return template;
}

export function useLingui() {
  return {
    i18n,
    _: resolveMessage,
  };
}

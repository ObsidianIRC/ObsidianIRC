import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Drop-in replacement for <input> with
 * autocomplete/autocorrect disabled by default.
 */
export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>((props, ref) => (
  <input
    type="text"
    autoComplete="off"
    autoCorrect="off"
    autoCapitalize="off"
    spellCheck={false}
    ref={ref}
    {...props}
  />
));
TextInput.displayName = "TextInput";

/**
 * Drop-in replacement for <textarea> with
 * autocomplete/autocorrect disabled by default.
 */
export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>((props, ref) => (
  <textarea
    autoComplete="off"
    autoCorrect="off"
    autoCapitalize="off"
    spellCheck={false}
    ref={ref}
    {...props}
  />
));
TextArea.displayName = "TextArea";

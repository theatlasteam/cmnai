import {
  TextInput as AstryxTextInput,
  type TextInputProps,
} from "@astryxdesign/core/TextInput";
import {
  TextArea as AstryxTextArea,
  type TextAreaProps,
} from "@astryxdesign/core/TextArea";

type UncontrolledInputProps = Omit<TextInputProps, "value" | "type"> & {
  value?: string;
  defaultValue?: string;
  type?: TextInputProps["type"] | "url" | "number" | "datetime-local";
};

/**
 * Astryx inputs are controlled and require `value`. Forms in this app submit
 * through server actions, so a tiny uncontrolled adapter keeps the browser's
 * native form behaviour while satisfying the component contract.
 */
export function TextInput({
  value,
  defaultValue,
  type,
  ...props
}: UncontrolledInputProps) {
  // Astryx only styles text, password and email inputs; the other native
  // types are passed through as-is so the browser renders its own control.
  const htmlType =
    type === "url" || type === "number"
      ? "text"
      : type === "datetime-local"
        ? ("datetime-local" as TextInputProps["type"])
        : type;
  const extra = { value, defaultValue } as unknown as TextInputProps;
  return <AstryxTextInput {...props} type={htmlType} {...extra} />;
}

type UncontrolledTextAreaProps = Omit<TextAreaProps, "value"> & {
  value?: string;
  defaultValue?: string;
};

export function TextArea({
  value,
  defaultValue,
  ...props
}: UncontrolledTextAreaProps) {
  const extra = { value, defaultValue } as unknown as TextAreaProps;
  return <AstryxTextArea {...props} {...extra} />;
}

export const PrefilledInput = TextInput;
export const PrefilledTextArea = TextArea;

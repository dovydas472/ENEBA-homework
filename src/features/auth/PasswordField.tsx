import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { TextField, type TextFieldProps } from "../../components/TextField.tsx";
import styles from "./PasswordField.module.css";

/**
 * A password input with a show/hide button (Task 14). Showing it switches the input to type="text" so the user
 * can check what they typed - useful on phones. The button is a real <button type="button"> (it must not
 * submit the form), and its name says what pressing it will do: "Show password" / "Hide password".
 */
export function PasswordField(props: Omit<TextFieldProps, "type" | "trailing">) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      // Password managers and phones must not "fix" a password.
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          className={styles.toggle}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((v) => !v)}
        >
          <Icon className={styles.icon} aria-hidden="true" />
        </button>
      }
    />
  );
}

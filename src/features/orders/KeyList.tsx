import { Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { VisuallyHidden } from "../../components/VisuallyHidden.tsx";
import { showToast } from "../../lib/toast.ts";
import styles from "./KeyList.module.css";
import { maskKey } from "./orderText.ts";

/**
 * Copies `text` to the clipboard and says so in a toast. navigator.clipboard works only on https or localhost and may
 * be refused by the browser; then the user is told how to copy by hand instead of nothing happening.
 */
async function copyKey(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast({ kind: "success", message: "Copied" });
  } catch {
    showToast({ kind: "info", message: "Could not copy. Reveal the key and copy it by hand." });
  }
}

/**
 * The keys of one paid order item. Each key is MASKED on screen ("DEMO-••••-••••-••••") until the user presses Reveal:
 * someone looking over the shoulder or a screen share should not see it by accident. Copy works without revealing.
 */
export function KeyList({ keys, title }: { keys: readonly string[]; title: string }) {
  return (
    <ul className={styles.keys} aria-label={`Keys for ${title}`}>
      {keys.map((key, index) => (
        <KeyRow key={key} value={key} name={keys.length > 1 ? `key ${index + 1} of ${title}` : `key of ${title}`} />
      ))}
    </ul>
  );
}

function KeyRow({ value, name }: { value: string; name: string }) {
  const [revealed, setRevealed] = useState(false);
  const RevealIcon = revealed ? EyeOff : Eye;
  return (
    <li className={styles.row}>
      <code className={styles.code}>
        {revealed ? value : maskKey(value)}
        {!revealed && <VisuallyHidden> (hidden)</VisuallyHidden>}
      </code>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          aria-pressed={revealed}
          aria-label={`${revealed ? "Hide" : "Reveal"} ${name}`}
          onClick={() => setRevealed((r) => !r)}
        >
          <RevealIcon className={styles.icon} aria-hidden="true" />
          {revealed ? "Hide" : "Reveal"}
        </button>
        <button type="button" className={styles.action} aria-label={`Copy ${name}`} onClick={() => void copyKey(value)}>
          <Copy className={styles.icon} aria-hidden="true" />
          Copy
        </button>
      </div>
    </li>
  );
}

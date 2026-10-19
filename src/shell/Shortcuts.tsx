import styles from "./Shortcuts.module.css";

const KEYS: [string, string][] = [
  ["C", "New task"],
  ["G then T / P / C / I", "Go to tasks / projects / calendar / triage"],
  ["J / K", "Next / previous task"],
  ["Enter", "Open task"],
  ["X", "Mark done (again: reopen)"],
  ["S", "Status"],
  ["P", "Priority"],
  ["D", "Due date"],
  ["L", "Labels"],
  ["M", "Move to project"],
  ["⌘↵", "Create (in the new task dialog)"],
  ["1 / 3", "Accept / decline (in Triage)"],
  ["Esc", "Close"],
  ["?", "This list"],
];

export function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.sheet} role="dialog" aria-label="Keyboard shortcuts">
      <header>
        <strong>Keyboard shortcuts</strong>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <dl>
        {KEYS.map(([k, what]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

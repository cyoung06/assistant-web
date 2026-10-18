import type { Priority, TaskStatus } from "../api/client";

// Linear-style glyphs, drawn in currentColor or the status color.

const STATUS_COLOR: Record<TaskStatus, string> = {
  backlog: "var(--text-3)",
  todo: "var(--text-2)",
  in_progress: "var(--warn)",
  done: "var(--accent)",
  canceled: "var(--text-3)",
};

export function StatusIcon({ status, size = 14 }: { status: TaskStatus; size?: number }) {
  const color = STATUS_COLOR[status];
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden style={{ flex: "none", color }}>
      {status === "backlog" && <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 1.6" />}
      {status === "todo" && <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {status === "in_progress" && (
        <>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M7 3.5 A3.5 3.5 0 0 1 7 10.5 Z" fill="currentColor" />
        </>
      )}
      {status === "done" && (
        <>
          <circle cx="7" cy="7" r="6.25" fill="currentColor" />
          <path d="M4.3 7.2 6.2 9 9.8 5.2" fill="none" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {status === "canceled" && (
        <>
          <circle cx="7" cy="7" r="6.25" fill="currentColor" />
          <path d="M5 5 9 9M9 5 5 9" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  if (priority === "urgent") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden style={{ flex: "none", color: "var(--danger)" }}>
        <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" />
        <path d="M7 3.8v4" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="7" cy="10.2" r="1" fill="var(--surface)" />
      </svg>
    );
  }
  if (priority === "none") {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden style={{ flex: "none", color: "var(--text-3)" }}>
        {[2, 6, 10].map((x) => (
          <rect key={x} x={x} y="6.25" width="2.5" height="1.5" rx="0.5" fill="currentColor" />
        ))}
      </svg>
    );
  }
  const filled = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden style={{ flex: "none", color: "var(--text-2)" }}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={1.5 + i * 4} y={9 - i * 3} width="3" height={3 + i * 3} rx="0.75" fill="currentColor" opacity={i < filled ? 1 : 0.3} />
      ))}
    </svg>
  );
}

export function Dot({ color, size = 9 }: { color?: string | null; size?: number }) {
  return <span aria-hidden style={{ flex: "none", width: size, height: size, borderRadius: "50%", background: color ?? "var(--text-3)" }} />;
}

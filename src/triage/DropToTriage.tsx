import { useEffect, useRef, useState } from "react";
import { useTasksUi } from "../tasks/context";
import { upload, useTriageMutations } from "./api";
import styles from "./DropToTriage.module.css";

/** Whether a drag carries something from outside the page (files, or a link or text from another app). */
const fromOutside = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].some((t) => t === "Files" || t === "text/uri-list");

/**
 * Drop screenshots, files, links or text anywhere in the app to send them to Triage. Without this
 * the browser would open the dropped file itself. A drop that a page handles itself (the Triage
 * composer) is left to it.
 */
export function DropToTriage() {
  const { submit } = useTriageMutations();
  const { notify } = useTasksUi();
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    // Pages that take drops themselves (the drive's files) are marked data-own-drop.
    const own = (e: DragEvent) => e.target instanceof Element && e.target.closest("[data-own-drop]") !== null;
    const enter = (e: DragEvent) => {
      if (!fromOutside(e) || own(e)) return;
      depth.current++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!fromOutside(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const dragOver = (e: DragEvent) => {
      if (!fromOutside(e) || own(e)) { if (own(e)) { depth.current = 0; setOver(false); } return; }
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const drop = async (e: DragEvent) => {
      depth.current = 0;
      setOver(false);
      if (!fromOutside(e) || !e.dataTransfer) return;
      if (e.defaultPrevented) return;
      e.preventDefault();
      const files = [...e.dataTransfer.files];
      const images = files.filter((f) => f.type.startsWith("image/"));
      const text = files.length ? "" : (e.dataTransfer.getData("text/uri-list").split("\n").find((l) => l && !l.startsWith("#")) ?? e.dataTransfer.getData("text/plain"));
      if (!images.length && !text.trim()) {
        notify(files.length ? "Only images can go to Triage" : "Nothing to send");
        return;
      }
      notify(images.length ? `Sending ${images.length === 1 ? "screenshot" : `${images.length} images`} to Triage…` : "Sending to Triage…");
      try {
        const attachmentIds = await Promise.all(images.map(upload));
        await submit.mutateAsync({ text, attachmentIds });
        notify("Sent to Triage");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Couldn't send to Triage");
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", dragOver);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", dragOver);
      window.removeEventListener("drop", drop);
    };
  }, [submit, notify]);

  return over ? (
    <div className={styles.overlay} aria-hidden>
      <div className={styles.card}>Drop to send to Triage</div>
    </div>
  ) : null;
}

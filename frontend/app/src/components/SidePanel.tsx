import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";

// Right-hand sliding panel shared by "User settings" and "Adjust intake".
// Closes on Escape, the close button, or a click on the backdrop.
export function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="panel-backdrop" onMouseDown={onClose}>
      <aside aria-label={title} aria-modal="true" className="preferences-panel" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="panel-top">
          <h2>{title}</h2>
          <button aria-label={`Close ${title.toLowerCase()}`} className="icon-button soft" onClick={onClose} type="button">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

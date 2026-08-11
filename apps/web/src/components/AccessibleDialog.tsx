import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

interface AccessibleDialogProps {
  children: ReactNode;
  className?: string;
  labelledBy: string;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  initialFocus?: string;
  initialFocusKey?: string | number;
}

export function AccessibleDialog({
  children,
  className = "choice-card",
  labelledBy,
  onClose,
  closeOnBackdrop = false,
  initialFocus,
  initialFocusKey,
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useLayoutEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(
        "button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])",
      )];
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0]!;
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const requestedTarget = initialFocus
      ? dialog.querySelector<HTMLElement>(initialFocus)
      : null;
    const labelledTarget = document.getElementById(labelledBy);
    const focusable = dialog.querySelector<HTMLElement>(
      "button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])",
    );
    const target = requestedTarget
      ?? (labelledTarget && dialog.contains(labelledTarget) ? labelledTarget : null)
      ?? focusable
      ?? dialog;
    if (
      target !== dialog
      && !target.hasAttribute("tabindex")
      && !target.matches("button, [href], input, select, textarea")
    ) {
      target.tabIndex = -1;
    }
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [initialFocus, initialFocusKey, labelledBy]);

  return (
    <motion.div
      className="choice-overlay"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? {} : { opacity: 0 }}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
      }}
    >
      <motion.section
        ref={dialogRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? {} : { opacity: 0, y: 12 }}
      >
        {children}
      </motion.section>
    </motion.div>
  );
}

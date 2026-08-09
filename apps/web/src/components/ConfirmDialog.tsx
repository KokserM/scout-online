import { AccessibleDialog } from "./AccessibleDialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <AccessibleDialog className="choice-card confirm-card" labelledBy="confirm-title" onClose={onCancel} closeOnBackdrop>
      <p className="eyebrow">PLEASE CONFIRM</p>
      <h1 id="confirm-title">{title}</h1>
      <p>{description}</p>
      <div className="confirm-actions">
        <button className="button button--secondary" onClick={onCancel}>Stay at the table</button>
        <button className="button button--primary danger-button" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </AccessibleDialog>
  );
}

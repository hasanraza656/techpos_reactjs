import * as Dialog from "@radix-ui/react-dialog";
import { X, AlertCircle, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { errorText } from "../lib/api";
export function ErrorBox({ error }: { error: unknown }) {
  return error ? (
    <div className="alert error" role="alert">
      <AlertCircle size={18} />
      <span>{errorText(error)}</span>
    </div>
  ) : null;
}
export function Loading({
  message = "Loading your workspace…",
}: { message?: string } = {}) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={20} /> {message}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        <p className="eyebrow">{eyebrow ?? "YOUR WORKSPACE"}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Statement-style dialogs with tables get more width on large screens. */
  wide?: boolean;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={wide ? "dialog dialog-wide" : "dialog"}>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description className="muted">
            {description}
          </Dialog.Description>
          <Dialog.Close className="icon-button close" aria-label="Close dialog">
            <X size={20} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

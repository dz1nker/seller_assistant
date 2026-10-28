"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@sales/ui";
export function Editor({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-label={title}
      className={`fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-6 text-foreground shadow-xl backdrop:bg-black/40 ${wide ? "max-w-3xl" : "max-w-lg"}`}
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          aria-label="Закрыть окно"
          className="px-2"
          onClick={close}
        >
          <X className="size-5" />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function FormError({ error }: { error: Error | null }) {
  return error ? (
    <p
      role="alert"
      className="my-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
    >
      {error.message}
    </p>
  ) : null;
}
export const selectClass =
  "h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-primary";

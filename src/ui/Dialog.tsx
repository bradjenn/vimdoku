import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { Button } from './Button'

export function TuiDialog({
  children,
  contentClassName = '',
  footer,
  narrow = false,
  onOpenChange,
  open,
  overlayClassName = 'bg-black/70',
  title,
  wide = false,
  zIndex = 'z-30',
}: {
  children: ReactNode
  contentClassName?: string
  footer?: ReactNode
  narrow?: boolean
  onOpenChange: (open: boolean) => void
  open: boolean
  overlayClassName?: string
  title: string
  wide?: boolean
  zIndex?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-radix-dialog-overlay
          className={`fixed inset-0 ${zIndex} ${overlayClassName} data-[state=closed]:animate-[fade-out_120ms_ease] data-[state=open]:animate-[fade-in_120ms_ease]`}
        />
        <DialogPrimitive.Content
          data-radix-dialog-content
          className={`fixed left-1/2 top-1/2 ${zIndex} max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden border border-[var(--border)] bg-[var(--panel-bg)] font-mono shadow-2xl shadow-black/40 outline-none data-[state=closed]:animate-[modal-out_120ms_ease] data-[state=open]:animate-[modal-in_140ms_ease] ${
            wide ? 'max-w-4xl' : narrow ? 'max-w-md' : 'max-w-2xl'
          } ${contentClassName}`}
        >
          <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 text-[var(--status-text)]">
            <DialogPrimitive.Title className="text-xs uppercase tracking-[0.16em]">
              [{title}]
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {footer ?? `${title} dialog`}
            </DialogPrimitive.Description>
            <DialogPrimitive.Close asChild>
              <Button size="sm" variant="default">
                esc
              </Button>
            </DialogPrimitive.Close>
          </header>
          <div className="max-h-[calc(100vh-10rem)] overflow-y-auto p-3">
            {children}
          </div>
          {footer && (
            <footer className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
              {footer}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

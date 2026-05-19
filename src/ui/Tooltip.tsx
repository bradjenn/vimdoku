import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export function Tooltip({
  children,
  content,
}: {
  children: ReactNode
  content: ReactNode
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="z-50 border border-[var(--border)] bg-[var(--panel-bg)] px-2 py-1 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-[var(--app-text)] shadow-xl shadow-black/30"
          sideOffset={6}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--border)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

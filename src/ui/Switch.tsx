import * as SwitchPrimitive from '@radix-ui/react-switch'

export function Switch({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 border border-[var(--border)] bg-[var(--status-bg)] px-3 py-2 font-mono">
      <span className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
        {label}
      </span>
      <SwitchPrimitive.Root
        aria-label={label}
        checked={checked}
        className="relative h-6 w-11 border border-[var(--border)] bg-[var(--button-bg)] outline-none transition data-[state=checked]:border-[var(--accent)] data-[state=checked]:bg-[var(--accent)]"
        onCheckedChange={onCheckedChange}
      >
        <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-1 bg-[var(--muted)] transition data-[state=checked]:translate-x-6 data-[state=checked]:bg-[var(--app-bg)]" />
      </SwitchPrimitive.Root>
    </div>
  )
}

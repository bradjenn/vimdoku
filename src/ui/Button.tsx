import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'default' | 'accent' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

export function Button({
  children,
  className = '',
  size = 'md',
  variant = 'default',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  size?: ButtonSize
  variant?: ButtonVariant
}) {
  const variantClass =
    variant === 'accent'
      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]'
      : variant === 'ghost'
        ? 'border-transparent bg-transparent text-[var(--muted)] hover:text-[var(--app-text)]'
        : variant === 'danger'
          ? 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--danger)] hover:border-[var(--danger)]'
          : 'border-[var(--border)] bg-[var(--button-bg)] text-[var(--app-text)] hover:border-[var(--accent)]'
  const sizeClass =
    size === 'sm'
      ? 'px-2 py-1 text-[0.65rem] tracking-[0.14em]'
      : 'px-3 py-2 text-xs tracking-[0.16em]'

  return (
    <button
      type="button"
      className={`border font-mono font-bold uppercase transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

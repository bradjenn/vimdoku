const GUEST_ID_KEY = 'vimdoku-convex-guest-id-v1';

export function getOrCreateGuestId() {
  const stored = localStorage.getItem(GUEST_ID_KEY);
  if (stored) return stored;

  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(GUEST_ID_KEY, generated);
  return generated;
}

export function shortGuestId(value: string) {
  return value.slice(0, 8);
}

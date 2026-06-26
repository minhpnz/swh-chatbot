export function tooSoon(lastUserMessageAt: string | null, windowMs = 1500): boolean {
  if (!lastUserMessageAt) return false;
  return Date.now() - new Date(lastUserMessageAt).getTime() < windowMs;
}

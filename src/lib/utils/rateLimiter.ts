const rateLimits = new Map<string, number>();

export function isRateLimited(key: string, limitMs: number = 1000): boolean {
  const now = Date.now();
  const lastTime = rateLimits.get(key);

  if (!lastTime || now - lastTime >= limitMs) {
    rateLimits.set(key, now);
    return false;
  }

  return true;
}

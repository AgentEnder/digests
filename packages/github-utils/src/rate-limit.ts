const rateLimitedCategories = new Set<string>();

export function isRateLimited(category: string): boolean {
  return rateLimitedCategories.has(category);
}

export function markRateLimited(category: string, resetAt?: Date): void {
  if (rateLimitedCategories.has(category)) return;

  rateLimitedCategories.add(category);

  const resetMsg = resetAt
    ? ` Resets at ${resetAt.toLocaleTimeString()}.`
    : '';
  console.warn(
    `⚠ GitHub API rate limit hit for ${category} requests. Skipping remaining ${category} calls.${resetMsg}`
  );
}

export function checkResponseForRateLimit(
  error: unknown,
  category: string
): void {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error.status === 403 || error.status === 429)
  ) {
    let resetAt: Date | undefined;
    if ('response' in error) {
      const response = error.response as { headers?: Record<string, string> };
      const resetHeader = response?.headers?.['x-ratelimit-reset'];
      if (resetHeader) {
        resetAt = new Date(parseInt(resetHeader, 10) * 1000);
      }
    }
    markRateLimited(category, resetAt);
  }
}

export function resetRateLimitState(): void {
  rateLimitedCategories.clear();
}

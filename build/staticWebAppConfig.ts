export function configureStaticWebApp<T extends { globalHeaders: Record<string, string> }>(config: T, apiBaseUrl: string): T {
  if (!apiBaseUrl) return config
  const url = new URL(apiBaseUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('VITE_API_BASE_URL must be an HTTPS origin without credentials, a path, query, or fragment.')
  }
  return {
    ...config,
    globalHeaders: {
      ...config.globalHeaders,
      'Content-Security-Policy': config.globalHeaders['Content-Security-Policy']
        .replace("connect-src 'self'", `connect-src 'self' ${url.origin}`),
    },
  }
}

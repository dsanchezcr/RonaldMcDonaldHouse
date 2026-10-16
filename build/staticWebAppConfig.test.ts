import { describe, expect, it } from 'vitest'
import { configureStaticWebApp } from './staticWebAppConfig'

const config = { globalHeaders: { 'Content-Security-Policy': "default-src 'self'; connect-src 'self'; frame-ancestors 'none'" } }

describe('deployment CSP', () => {
  it('adds only the configured HTTPS API origin without changing the source template', () => {
    expect(configureStaticWebApp(config, 'https://api.example.org/').globalHeaders['Content-Security-Policy'])
      .toBe("default-src 'self'; connect-src 'self' https://api.example.org; frame-ancestors 'none'")
    expect(configureStaticWebApp(config, '')).toEqual(config)
    expect(config.globalHeaders['Content-Security-Policy']).not.toContain('example.org')
  })

  it.each(['http://api.example.org', 'https://user:pass@example.org', 'https://example.org/path', 'https://example.org/?token=value', 'https://example.org/#fragment', "https://example.org; script-src *"])('rejects unsafe API configuration %s', (url) => {
    expect(() => configureStaticWebApp(config, url)).toThrow()
  })
})

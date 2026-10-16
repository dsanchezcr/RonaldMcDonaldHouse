import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { configureStaticWebApp } from './build/staticWebAppConfig.ts'

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'deployment-csp',
    apply: 'build',
    async writeBundle(options) {
      const env = loadEnv(mode, process.cwd(), 'VITE_')
      const template = JSON.parse(await readFile(new URL('./public/staticwebapp.config.json', import.meta.url), 'utf8'))
      const config = configureStaticWebApp(template, env.VITE_API_BASE_URL || '')
      await writeFile(resolve(options.dir || 'dist', 'staticwebapp.config.json'), `${JSON.stringify(config, null, 2)}\n`)
    },
  }],
  server: {
    proxy: {
      '/api': 'http://localhost:7071',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', '**/node_modules/**', 'api/**', '.tsupgrader/**'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
}))

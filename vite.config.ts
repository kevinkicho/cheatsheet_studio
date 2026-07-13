import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import type { ProxyOptions } from 'vite'

/**
 * Dev proxy for Ollama — browser calls same-origin `/ollama-proxy/*`
 * so Chrome CORS never blocks local or ollama.com Cloud.
 *
 * Secrets stay on the Vite server:
 *   OLLAMA_API_KEY=…          (from ollama.com/settings/keys — never VITE_*)
 *   OLLAMA_MODE=cloud|local  (default: cloud if key set, else local)
 *   OLLAMA_HOST=…             (optional override of target)
 */
export default defineConfig(({ mode }) => {
  // load all env keys (not only VITE_) so OLLAMA_API_KEY works
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = (env.OLLAMA_API_KEY || '').trim()
  const modeHint = (env.OLLAMA_MODE || '').trim().toLowerCase()
  const useCloud =
    modeHint === 'cloud' ||
    (modeHint !== 'local' && Boolean(apiKey)) ||
    (env.OLLAMA_HOST || '').includes('ollama.com')

  const target =
    (env.OLLAMA_HOST || '').trim() ||
    (useCloud ? 'https://ollama.com' : 'http://127.0.0.1:11434')

  const ollamaProxy: ProxyOptions = {
    target,
    changeOrigin: true,
    secure: true,
    rewrite: (p) => p.replace(/^\/ollama-proxy/, ''),
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => {
        // Cloud API requires Bearer key; local ignores it
        if (apiKey) {
          proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
        }
        // Avoid leaking browser origin quirks
        proxyReq.removeHeader?.('origin')
      })
      proxy.on('error', (err) => {
        console.error('[ollama-proxy]', err.message)
      })
    },
  }

  if (mode === 'development') {
    console.info(
      `[ollama-proxy] → ${target}` +
        (apiKey ? ' (Authorization: Bearer ***)' : ' (no API key)'),
    )
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/ollama-proxy': ollamaProxy,
      },
    },
    // preview also proxies so `vite preview` works the same
    preview: {
      proxy: {
        '/ollama-proxy': ollamaProxy,
      },
    },
  }
})

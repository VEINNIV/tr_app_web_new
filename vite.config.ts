import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Which commit this build is made from, so the admin-only version badge can show it.
 * Coolify sets SOURCE_COMMIT when asked to; otherwise we read .git/HEAD ourselves (no git binary needed).
 * Returns '' when neither is available (local dev without git).
 */
function currentCommit(): string {
  const fromEnv = process.env.SOURCE_COMMIT?.trim()
  if (fromEnv) return fromEnv
  try {
    const gitDir = path.resolve(__dirname, '.git')
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim()
    if (!head.startsWith('ref: ')) return head
    return fs.readFileSync(path.join(gitDir, head.slice(5)), 'utf8').trim()
  } catch {
    return ''
  }
}

const CHUNKS: Record<string, string[]> = {
  'vendor-react': ['react', 'react-dom', 'react-router-dom'],
  'vendor-motion': ['framer-motion'],
  'vendor-pdf': ['pdfjs-dist'],
  'vendor-doc': ['docx', 'file-saver'],
  'vendor-markdown': ['react-markdown', 'remark-gfm', 'remark-math', 'rehype-katex'],
  // KaTeX (~270KB) ve PDF üretim kütüphaneleri ayrı chunk'lara — devasa tek chunk'ı böler,
  // ayrı cache'lenir ve yalnızca ihtiyaç duyan lazy route'larda yüklenir.
  'vendor-katex': ['katex'],
  'vendor-pdfgen': ['jspdf', 'pdf-lib', '@pdf-lib/fontkit'],
  'vendor-zip': ['jszip'],
  'vendor-supabase': ['@supabase/supabase-js'],
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Build-time stamp shown by components/ui/VersionBadge.tsx (admins only).
  define: {
    __APP_VERSION__: JSON.stringify({ commit: currentCommit(), builtAt: new Date().toISOString() }),
  },

  resolve: {
    alias: {
      // micromark/dev build'ları Vite 8 / Rolldown ile çözülemiyor (debug CJS sorunu).
      // Production build'ına yönlendiriyoruz.
      'micromark/dev': 'micromark',
    },
  },

  optimizeDeps: {
    include: [
      // Açık CJS paketler — Rolldown'un ESM'e dönüştürmesi için force include.
      'docx',
      'file-saver',
      // react-router-dom v7'nin bağımlılığı; Rolldown pre-bundle'da bulamıyor.
      'cookie',
      // pdf-lib ve fontkit saf CJS/UMD; module field yok, Rolldown ile sorun çıkabilir.
      'pdf-lib',
      '@pdf-lib/fontkit',
      // debug CJS paketi — micromark/create-tokenizer içinden require ediliyor, Vite ESM'e çeviremiyor
      'debug',
    ],
    exclude: [
      // micromark'ı Rolldown pre-bundle'dan çıkar; alias zaten dev→prod yönlendiriyor.
      'micromark',
    ],
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Windows'ta Rolldown path ayırıcısı ters slash olabilir; normalize et.
          const normalizedId = id.replace(/\\/g, '/')
          for (const [chunk, pkgs] of Object.entries(CHUNKS)) {
            if (pkgs.some(pkg => normalizedId.includes(`/node_modules/${pkg}/`))) return chunk
          }
        },
      },
    },
  },
})

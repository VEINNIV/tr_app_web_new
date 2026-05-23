import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const CHUNKS: Record<string, string[]> = {
  'vendor-react': ['react', 'react-dom', 'react-router-dom'],
  'vendor-motion': ['framer-motion'],
  'vendor-pdf': ['pdfjs-dist'],
  'vendor-doc': ['docx', 'file-saver'],
  'vendor-markdown': ['react-markdown', 'remark-gfm'],
  'vendor-supabase': ['@supabase/supabase-js'],
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

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

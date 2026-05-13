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
  optimizeDeps: {
    include: ['docx', 'file-saver'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          for (const [chunk, pkgs] of Object.entries(CHUNKS)) {
            if (pkgs.some(pkg => id.includes(`/node_modules/${pkg}/`))) return chunk
          }
        },
      },
    },
  },
})

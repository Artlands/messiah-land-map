import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Static build for GitHub Pages. The vinext/Cloudflare setup in vite.config.ts
// is untouched — this config only bundles the same app as a plain SPA.
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/Messiah-Land-Map/',
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  build: {
    outDir: 'dist-static',
    emptyOutDir: true,
    rollupOptions: {
      // 'use client' is meaningless outside RSC; the warning is not actionable.
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
});

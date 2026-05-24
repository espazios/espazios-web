import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://www.espazios.com.co',
  output: 'hybrid',
  adapter: vercel({
    webAnalytics: { enabled: true },
    imageService: true,
  }),
  integrations: [
    mdx(),
    sitemap({
      i18n: { defaultLocale: 'es', locales: { es: 'es-CO' } },
      changefreq: 'weekly',
      priority: 0.7,
    }),
  ],
  i18n: {
    defaultLocale: 'es',
    locales: ['es'],
  },
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    css: { devSourcemap: true },
  },
});

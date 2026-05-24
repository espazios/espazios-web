import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel/serverless';
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
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    css: { devSourcemap: true },
  },
});

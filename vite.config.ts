import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        'pick-location': resolve(__dirname, 'pick-location.html'),
        'pick-destination': resolve(__dirname, 'pick-destination.html'),
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig(({ command }) => {
  const isElectron = process.env.ELECTRON === 'true'

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isElectron ? [
        electron([
          {
            entry: 'electron/main.ts',
            vite: {
              build: {
                outDir: 'dist-electron',
                rollupOptions: {
                  external: ['electron', 'better-sqlite3'],
                },
              },
            },
          },
          {
            entry: 'electron/preload.ts',
            onstart({ reload }) {
              reload()
            },
            vite: {
              build: {
                outDir: 'dist-electron',
                rollupOptions: {
                  external: ['electron'],
                },
              },
            },
          },
        ]),
        renderer(),
      ] : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    base: command === 'build' && isElectron ? './' : '/',
  }
})

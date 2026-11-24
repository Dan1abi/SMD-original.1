import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // Отделни chunk-ове: ядрото на алгоритмите и React се кешират отделно от UI.
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});

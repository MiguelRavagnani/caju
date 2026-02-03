import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'fs';

// Helper to recursively copy directory
function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = resolve(src, entry);
    const destPath = resolve(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export default defineConfig({
  plugins: [
    glsl({
      include: [
        '**/*.glsl',
        '**/*.wgsl',
        '**/*.vert',
        '**/*.frag',
        '**/*.vs',
        '**/*.fs'
      ],
      compress: true,
      root: '/'
    }),
    wasm(),
    topLevelAwait(),
    {
      name: 'copy-static',
      writeBundle() {
        // Copy assets folder to dist/assets to preserve path structure
        copyDir(resolve(__dirname, 'assets'), resolve(__dirname, 'dist/assets'));
        // Copy fonts folder
        copyDir(resolve(__dirname, 'fonts'), resolve(__dirname, 'dist/fonts'));
        // Copy styles folder
        copyDir(resolve(__dirname, 'styles'), resolve(__dirname, 'dist/styles'));
        // Copy Cloudflare headers file
        copyFileSync(resolve(__dirname, '_headers'), resolve(__dirname, 'dist/_headers'));
      }
    }
  ],
  publicDir: false,
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'three-addons': [
            'three/addons/loaders/GLTFLoader.js',
            'three/addons/loaders/RGBELoader.js',
            'three/addons/controls/OrbitControls.js',
            'three/addons/postprocessing/EffectComposer.js',
            'three/addons/postprocessing/RenderPass.js',
            'three/addons/postprocessing/ShaderPass.js'
          ]
        }
      }
    }
  },
  server: {
    port: 8000,
    open: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  optimizeDeps: {
    exclude: ['caju-wasm'],
  }
});

# Caju

A webpage a built for my dog. She's cool, and deserved a cool webpage. She's also a bit anoying most of the time, so the webpage reflects that.

![til](./resource/caju.gif)

Basically, this is an interactive 3D visualization with Three.js and Rust/WASM.

## Tech Stack

- Three.js for rendering
- Rust compiled to WebAssembly for performance-critical operations (matrix math, BVH raycasting, and some mesh generation. Maybe overkill, but fun overkill)
- Vite build system
- Cloudflare Pages deployment

3D models and textures were modeled in [Blender](https://www.blender.org/). Blender is really cool too.

## Requirements

- Node.js 20+
- Rust toolchain with `wasm32-unknown-unknown` target
- wasm-pack

## Development

```bash
npm install
npm run build:wasm
npm run dev
```

## Build

```bash
# Full build (WASM + Vite)
npm run build:full

# Vite only (requires pre-built WASM)
npm run build
```

## WASM

The `wasm/` directory contains Rust code compiled to WebAssembly:

```bash
# Build WASM (release)
npm run build:wasm

# Build WASM (dev)
npm run build:wasm:dev
```

## Makefile

```bash
make dev              # Start dev server
make build            # Full build
make lint             # Run all linters
make fmt              # Format code
make clippy           # Rust linter
```

## Structure

```text
src/
  components/   # 3D objects
  scenes/       # Scene setup
  shaders/      # GLSL shaders
  utils/        # Camera, renderer, helpers
  wasm/         # WASM bridge

wasm/
  src/          # Rust source
  pkg/          # Compiled WASM output
```

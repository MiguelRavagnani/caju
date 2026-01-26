# Caju

Interactive 3D visualization built with Three.js.

## Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:8000`

## Build

```bash
npm run build
```

Output goes to `dist/`.

## Features

- Custom glass and subsurface scattering shaders via `onBeforeCompile`
- Interactive vertex deformation with ripple effects
- CRT post-processing with responsive mobile/desktop presets
- PBR materials with HDRI lighting

## Interaction

- Click & drag to rotate camera
- Scroll to zoom
- Click on model to pull vertices, release for ripple

## Structure

```text
src/
├── components/     # 3D objects
├── scenes/         # Scene setup
├── shaders/        # GLSL shaders
└── utils/          # Camera, renderer, helpers
```

## License

MIT

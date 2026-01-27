/**
 * Synthwave Post-Processing Shader
 * Creates a retro 80s/vaporwave aesthetic with neon colors, grid, and glow
 */

import vertexShader from './crt.vert.glsl';
import fragmentShader from './crt.frag.glsl';

export const CRTShader = {
    uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        tNoise: { value: null }, // Pre-computed noise texture from WASM
        uTime: { value: 1.0 },
        uResolution: { value: { x: 1920, y: 1080 } },
        uCameraNear: { value: 0.1 },
        uCameraFar: { value: 100.0 },

        // Synthwave effect parameters
        uGridIntensity: { value: 0.1 },
        uGridSize: { value: 0.02 },
        uScanlineIntensity: { value: 0.05 },
        uScanlineCount: { value: 1300.0 },
        uVignetteIntensity: { value: 0.15 },
        uChromaticAberration: { value: 0.015 },
        uGrainIntensity: { value: 0.03 },
        uGlowIntensity: { value: 0.1 },
        uColorShift: { value: 0.1 },
        uFisheyeStrength: { value: 0.1 }
    },

    vertexShader,
    fragmentShader
};

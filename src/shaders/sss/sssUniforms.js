import * as THREE from 'three';
import {
    findAndInsertAfter,
    findAndInsertBefore,
    addVaryings,
    addUniforms
} from '../utils/shaderInjection.js';
import vertexShader from './vertex.js';
import fragmentShader from './fragment.js';

/**
 * Subsurface Scattering (SSS) Shader Extension for MeshPhysicalMaterial
 * Adds enhanced SSS with back-lighting translucency
 */

// Vertex shader varyings (don't declare vWorldPosition - Three.js provides it via USE_TRANSMISSION)
const VERTEX_VARYINGS = [
    'varying vec3 vViewDirection;',
    'varying float vThickness;',
    'varying vec3 vOriginalPosition;'
];

// Fragment shader varyings (vWorldPosition provided by Three.js)
const FRAGMENT_VARYINGS = ['varying vec3 vViewDirection;', 'varying float vThickness;'];

// Fragment shader uniforms
const FRAGMENT_UNIFORMS = [
    'uniform float uTime;',
    'uniform float uSSSStrength;',
    'uniform float uTranslucency;',
    'uniform vec3 uTranslucencyColor;'
];

/**
 * Apply SSS shader modifications to a Three.js shader
 * @param {object} shader - The shader object from onBeforeCompile
 */
export function createSSSShader(shader) {
    // Add custom uniforms
    shader.uniforms.uTime = { value: 0.0 };
    shader.uniforms.uSSSStrength = { value: 0.8 };
    shader.uniforms.uTranslucency = { value: 0.4 };
    shader.uniforms.uTranslucencyColor = { value: new THREE.Color('#ff9966') };

    // Ripple uniforms - support up to 5 simultaneous ripples
    shader.uniforms.uRipplePositions = {
        value: [
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3()
        ]
    };
    shader.uniforms.uRippleTimes = { value: [0, 0, 0, 0, 0] };
    shader.uniforms.uRippleTypes = { value: [-1, -1, -1, -1, -1] }; // -1=none, 0=deflate, 1=inflate
    shader.uniforms.uRippleStrength = { value: 1.0 };

    // Pre-computed inverse model matrix (computed on CPU via WASM for performance)
    shader.uniforms.uInverseModelMatrix = { value: new THREE.Matrix4() };

    // Modify vertex shader
    shader.vertexShader = addVaryings(shader.vertexShader, VERTEX_VARYINGS);
    shader.vertexShader = addUniforms(shader.vertexShader, [
        'uniform float uTime;',
        'uniform vec3 uRipplePositions[5];',
        'uniform float uRippleTimes[5];',
        'uniform float uRippleTypes[5];',
        'uniform float uRippleStrength;',
        'uniform mat4 uInverseModelMatrix;'
    ]);

    // Try multiple vertex injection points (inject AFTER these)
    const vertexInjectionPoints = [
        '#include <begin_vertex>', // Early, right after position is set
        '#include <beginnormal_vertex>', // After normals are set
        '#include <defaultnormal_vertex>',
        '#include <project_vertex>' // Last resort, after transformations
    ];

    for (const point of vertexInjectionPoints) {
        if (shader.vertexShader.includes(point)) {
            shader.vertexShader = findAndInsertAfter(shader.vertexShader, point, vertexShader);
            break;
        }
    }

    // Modify fragment shader
    shader.fragmentShader = addVaryings(shader.fragmentShader, FRAGMENT_VARYINGS);
    shader.fragmentShader = addUniforms(shader.fragmentShader, FRAGMENT_UNIFORMS);

    // Try multiple injection points (Three.js version compatibility)
    const injectionPoints = [
        '#include <opaque_fragment>',
        '#include <tonemapping_fragment>',
        '#include <colorspace_fragment>',
        '#include <fog_fragment>'
    ];

    for (const point of injectionPoints) {
        if (shader.fragmentShader.includes(point)) {
            shader.fragmentShader = findAndInsertBefore(
                shader.fragmentShader,
                point,
                fragmentShader
            );
            break;
        }
    }
}

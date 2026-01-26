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
 * Glass Shader Extension for MeshPhysicalMaterial
 * Adds chromatic aberration and enhanced fresnel rim lighting
 */

// Vertex shader varyings (vWorldPosition provided by Three.js via USE_TRANSMISSION)
const VERTEX_VARYINGS = [
    'varying vec3 vRefractionR;',
    'varying vec3 vRefractionG;',
    'varying vec3 vRefractionB;',
    'varying vec3 vWorldNormal;',
    'varying vec3 vOriginalPosition;'
];

// Fragment shader varyings (vWorldPosition provided by Three.js)
const FRAGMENT_VARYINGS = [
    'varying vec3 vRefractionR;',
    'varying vec3 vRefractionG;',
    'varying vec3 vRefractionB;',
    'varying vec3 vWorldNormal;'
];

// Fragment shader uniforms
const FRAGMENT_UNIFORMS = [
    'uniform float uTime;',
    'uniform float uDispersion;',
    'uniform float uIorR;',
    'uniform float uIorG;',
    'uniform float uIorB;'
];

/**
 * Apply glass shader modifications to a Three.js shader
 * @param {object} shader - The shader object from onBeforeCompile
 */
export function createGlassShader(shader) {
    // Add custom uniforms
    shader.uniforms.uTime = { value: 0.0 };
    shader.uniforms.uDispersion = { value: 0.02 }; // Subtle chromatic aberration
    shader.uniforms.uIorR = { value: 1.49 }; // Red channel - less refraction
    shader.uniforms.uIorG = { value: 1.5 }; // Green channel - base IOR (matches material)
    shader.uniforms.uIorB = { value: 1.51 }; // Blue channel - more refraction

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
        'uniform float uIorR;',
        'uniform float uIorG;',
        'uniform float uIorB;',
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

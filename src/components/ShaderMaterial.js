import * as THREE from 'three';

// Example of how to use custom shaders
// Import your shader files and use them with ShaderMaterial

export class CustomShaderMaterial {
    constructor(vertexShader, fragmentShader) {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uColor: { value: new THREE.Color(0x00ff88) }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.DoubleSide
        });

        this.time = 0;
    }

    update(deltaTime) {
        this.time += deltaTime;
        this.material.uniforms.uTime.value = this.time;
    }

    setColor(color) {
        this.material.uniforms.uColor.value.set(color);
    }

    getMaterial() {
        return this.material;
    }

    dispose() {
        this.material.dispose();
    }
}

// Example usage:
//
// import vertexShader from '../shaders/example.vert.glsl?raw';
// import fragmentShader from '../shaders/example.frag.glsl?raw';
//
// const shaderMat = new CustomShaderMaterial(vertexShader, fragmentShader);
// const geometry = new THREE.PlaneGeometry(2, 2);
// const mesh = new THREE.Mesh(geometry, shaderMat.getMaterial());

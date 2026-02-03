import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSSSShader } from '../shaders/sss/sssUniforms.js';
import { Component } from './Component.js';

export class OrbitingObject extends Component {
    constructor(performanceSettings = {}) {
        super({
            orbitRadius: 8,
            orbitSpeed: 0.1,
            verticalOffset: 2,
            tilt: Math.PI * 0.15,
            ripplesEnabled: performanceSettings.ripplesEnabled !== false
        });

        this.orbitAngle = 0;
        this.sssUniforms = [];

        // Ripple system
        this.ripples = [];
        this.maxRipples = 1;
        this.inflateRipple = null;

        // Raycaster for click detection
        this.raycaster = new THREE.Raycaster();

        this._createPlaceholder();
    }

    _createPlaceholder() {
        const geometry = new THREE.IcosahedronGeometry(1.5, 0);
        const material = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            roughness: 0.3,
            metalness: 0.7,
            wireframe: false,
            emissive: 0x224466,
            emissiveIntensity: 0.2
        });

        if (this.config.ripplesEnabled) {
            material.onBeforeCompile = (shader) => {
                createSSSShader(shader);
                this.sssUniforms.push(shader.uniforms);
            };
        }

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.renderOrder = 50;

        this._updateOrbitalPosition(0);
    }

    loadModel(modelPath, onLoad) {
        const loader = new GLTFLoader();
        loader.load(modelPath, (gltf) => {
            const oldPosition = this.mesh.position.clone();
            const oldRotation = this.mesh.rotation.clone();

            if (this.mesh.parent) {
                this.mesh.parent.remove(this.mesh);
            }

            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.sssUniforms = [];

            this.mesh = gltf.scene;

            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    if (this.config.ripplesEnabled) {
                        child.material.onBeforeCompile = (shader) => {
                            createSSSShader(shader);
                            this.sssUniforms.push(shader.uniforms);
                        };
                        child.material.needsUpdate = true;
                    }
                    child.renderOrder = 50;
                }
            });

            this.mesh.position.copy(oldPosition);
            this.mesh.rotation.copy(oldRotation);

            this._onLoad(onLoad);
        });
    }

    _updateOrbitalPosition(deltaTime) {
        const { orbitRadius, orbitSpeed, verticalOffset, tilt } = this.config;

        this.orbitAngle += orbitSpeed * deltaTime;

        const x = Math.cos(this.orbitAngle) * orbitRadius;
        const z = Math.sin(this.orbitAngle) * orbitRadius;
        const y = verticalOffset + Math.sin(this.orbitAngle) * orbitRadius * Math.sin(tilt);
        const adjustedZ = z * Math.cos(tilt);

        this.mesh.position.set(x, y, adjustedZ);
        this.mesh.rotation.y += deltaTime * 0.3;
        this.mesh.rotation.x += deltaTime * 0.1;
    }

    update(cameraOrDelta, deltaTime) {
        // Backward compatible: support both update(deltaTime) and update(camera, deltaTime)
        const dt = typeof cameraOrDelta === 'number' ? cameraOrDelta : deltaTime;
        super.update(null, dt);
        if (!this.mesh) return;

        this._updateOrbitalPosition(dt);

        // Update shader uniforms
        this.sssUniforms.forEach((uniforms) => {
            uniforms.uTime.value += dt;
            this._updateRippleUniforms(uniforms);
        });

        // Clean up old ripples
        const currentTime = this.sssUniforms.length > 0 ? this.sssUniforms[0].uTime.value : 0;
        this.ripples = this.ripples.filter((ripple) => currentTime - ripple.time < 1.5);
    }

    _updateRippleUniforms(uniforms) {
        if (!this.config.ripplesEnabled) {
            for (let i = 0; i < 5; i++) {
                uniforms.uRipplePositions.value[i].set(0, 0, 0);
                uniforms.uRippleTimes.value[i] = 0;
                uniforms.uRippleTypes.value[i] = -1.0;
            }
            return;
        }

        // Handle inflate ripple (slot 0)
        if (this.inflateRipple) {
            uniforms.uRipplePositions.value[0].copy(this.inflateRipple.position);
            uniforms.uRippleTimes.value[0] = this.inflateRipple.time;
            uniforms.uRippleTypes.value[0] = 1.0;
        } else if (this.ripples.length > 0) {
            uniforms.uRipplePositions.value[0].copy(this.ripples[0].position);
            uniforms.uRippleTimes.value[0] = this.ripples[0].time;
            uniforms.uRippleTypes.value[0] = 0.0;
        } else {
            uniforms.uRipplePositions.value[0].set(0, 0, 0);
            uniforms.uRippleTimes.value[0] = 0;
            uniforms.uRippleTypes.value[0] = -1.0;
        }

        // Clear remaining slots
        for (let i = 1; i < 5; i++) {
            uniforms.uRipplePositions.value[i].set(0, 0, 0);
            uniforms.uRippleTimes.value[i] = 0;
            uniforms.uRippleTypes.value[i] = -1.0;
        }
    }

    handlePress(mouseNDC, camera) {
        if (!this.mesh) return false;

        this.raycaster.setFromCamera(mouseNDC, camera);
        const intersects = this.raycaster.intersectObject(this.mesh, true);

        if (intersects.length > 0) {
            const worldPosition = intersects[0].point;
            this.ripples = [];

            const currentTime = this.sssUniforms.length > 0 ? this.sssUniforms[0].uTime.value : 0;
            this.inflateRipple = {
                position: worldPosition.clone(),
                time: currentTime
            };

            return true;
        }

        return false;
    }

    updatePullPosition(mouseNDC, camera) {
        if (!this.mesh || !this.inflateRipple) return;

        this.raycaster.setFromCamera(mouseNDC, camera);

        const pullDepth = this.inflateRipple.position.distanceTo(camera.position);
        const vector = new THREE.Vector3(mouseNDC.x, mouseNDC.y, 0.5);
        vector.unproject(camera);

        const dir = vector.sub(camera.position).normalize();
        const newPosition = camera.position.clone().add(dir.multiplyScalar(pullDepth));

        this.inflateRipple.position.copy(newPosition);
    }

    handleRelease() {
        if (this.inflateRipple) {
            const currentTime = this.sssUniforms.length > 0 ? this.sssUniforms[0].uTime.value : 0;
            this.ripples = [
                {
                    position: this.inflateRipple.position.clone(),
                    time: currentTime
                }
            ];
            this.inflateRipple = null;
        }
    }

    dispose() {
        super.dispose();
    }
}

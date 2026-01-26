import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSSSShader } from '../shaders/sss/sssUniforms.js';

export class OrbitingObject {
    constructor(performanceSettings = {}) {
        this.mesh = null;
        this.orbitRadius = 8; // Distance from center
        this.orbitSpeed = 0.1; // Slow rotation speed (reduced from 0.15 for better performance)
        this.orbitAngle = 0; // Current angle in orbit
        this.verticalOffset = 2; // Height offset
        this.tilt = Math.PI * 0.15; // Tilt the orbit plane slightly

        this.performanceSettings = performanceSettings;
        this.ripplesEnabled = performanceSettings.ripplesEnabled !== false;
        this.sssUniforms = [];

        // Ripple system - store up to 5 active ripples
        this.ripples = [];
        this.maxRipples = 1;

        // Inflation tracking
        this.inflateRipple = null; // Stores the current inflate effect

        // Raycaster for click detection
        this.raycaster = new THREE.Raycaster();

        this.createPlaceholder();
    }

    /**
     * Create a placeholder mesh (will be replaced with GLB later)
     */
    createPlaceholder() {
        // Create a simple geometric placeholder
        const geometry = new THREE.IcosahedronGeometry(1.5, 0);
        const material = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            roughness: 0.3,
            metalness: 0.7,
            wireframe: false,
            emissive: 0x224466,
            emissiveIntensity: 0.2
        });

        // Apply custom shader for ripple effects when enabled
        if (this.ripplesEnabled) {
            material.onBeforeCompile = (shader) => {
                createSSSShader(shader);
                this.sssUniforms.push(shader.uniforms);
            };
        }

        this.mesh = new THREE.Mesh(geometry, material);

        // Set render order to be behind text planes but in front of background
        this.mesh.renderOrder = 50;

        // Initial position
        this.updatePosition(0);
    }

    /**
     * Load GLB model to replace placeholder
     * @param {string} modelPath - Path to GLB file
     * @param {Function} onLoad - Callback when model is loaded
     */
    loadModel(modelPath, onLoad) {
        const loader = new GLTFLoader();
        loader.load(modelPath, (gltf) => {
            // Store old position
            const oldPosition = this.mesh.position.clone();
            const oldRotation = this.mesh.rotation.clone();

            // Remove old placeholder
            if (this.mesh.parent) {
                this.mesh.parent.remove(this.mesh);
            }

            // Dispose old geometry and material
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();

            // Clear old uniforms
            this.sssUniforms = [];

            // Set new mesh
            this.mesh = gltf.scene;

            // Apply SSS shader to all meshes in loaded model
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    // Apply custom shader for ripple effects when enabled
                    if (this.ripplesEnabled) {
                        child.material.onBeforeCompile = (shader) => {
                            createSSSShader(shader);
                            this.sssUniforms.push(shader.uniforms);
                        };
                        // Force material to recompile
                        child.material.needsUpdate = true;
                    }

                    // Set render order
                    child.renderOrder = 50;
                }
            });

            // Restore position and rotation
            this.mesh.position.copy(oldPosition);
            this.mesh.rotation.copy(oldRotation);

            if (onLoad) {
                onLoad(this);
            }
        });
    }

    getMesh() {
        return this.mesh;
    }

    /**
     * Update orbital position
     * @param {number} deltaTime - Time since last frame in seconds
     */
    updatePosition(deltaTime) {
        // Increment orbit angle
        this.orbitAngle += this.orbitSpeed * deltaTime;

        // Calculate position on tilted circular orbit
        const x = Math.cos(this.orbitAngle) * this.orbitRadius;
        const z = Math.sin(this.orbitAngle) * this.orbitRadius;

        // Apply tilt to create an elliptical orbit in 3D space
        const y =
            this.verticalOffset +
            Math.sin(this.orbitAngle) * this.orbitRadius * Math.sin(this.tilt);
        const adjustedZ = z * Math.cos(this.tilt);

        this.mesh.position.set(x, y, adjustedZ);

        // Make object slowly rotate on its own axis
        this.mesh.rotation.y += deltaTime * 0.3;
        this.mesh.rotation.x += deltaTime * 0.1;
    }

    update(deltaTime) {
        this.updatePosition(deltaTime);

        // Update shader uniforms (time and ripples)
        this.sssUniforms.forEach((uniforms) => {
            const currentTime = uniforms.uTime.value;
            uniforms.uTime.value += deltaTime;
            this.updateRippleUniforms(uniforms, currentTime);
        });

        // Clean up old ripples (older than 1.5 seconds)
        const currentTime = this.sssUniforms.length > 0 ? this.sssUniforms[0].uTime.value : 0;
        this.ripples = this.ripples.filter((ripple) => currentTime - ripple.time < 1.5);
    }

    /**
     * Update ripple uniforms for shader
     * @param {object} uniforms - Shader uniforms object
     * @param {number} currentTime - Current shader time
     */
    updateRippleUniforms(uniforms, _currentTime) {
        // Skip ripple updates if disabled for performance
        if (!this.ripplesEnabled) {
            // Disable all ripples
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
            uniforms.uRippleTypes.value[0] = 1.0; // Type 1 = inflate
        } else if (this.ripples.length > 0) {
            // Handle deflate ripple (slot 0)
            uniforms.uRipplePositions.value[0].copy(this.ripples[0].position);
            uniforms.uRippleTimes.value[0] = this.ripples[0].time;
            uniforms.uRippleTypes.value[0] = 0.0; // Type 0 = deflate/ripple
        } else {
            // Clear slot
            uniforms.uRipplePositions.value[0].set(0, 0, 0);
            uniforms.uRippleTimes.value[0] = 0;
            uniforms.uRippleTypes.value[0] = -1.0; // No effect
        }

        // Clear remaining slots
        for (let i = 1; i < 5; i++) {
            uniforms.uRipplePositions.value[i].set(0, 0, 0);
            uniforms.uRippleTimes.value[i] = 0;
            uniforms.uRippleTypes.value[i] = -1.0;
        }
    }

    /**
     * Handle mouse/touch press - start pull effect
     * @param {THREE.Vector2} mouseNDC - Mouse position in normalized device coordinates
     * @param {THREE.Camera} camera - Camera to use for raycasting
     * @returns {boolean} True if mesh was grabbed
     */
    handlePress(mouseNDC, camera) {
        if (!this.mesh) return false;

        // Set up raycaster
        this.raycaster.setFromCamera(mouseNDC, camera);

        // Find intersections with the model
        const intersects = this.raycaster.intersectObject(this.mesh, true);

        if (intersects.length > 0) {
            const intersection = intersects[0];
            const worldPosition = intersection.point;

            // Clear any existing deflate ripples
            this.ripples = [];

            // Start pull effect
            const currentTime = this.sssUniforms.length > 0 ? this.sssUniforms[0].uTime.value : 0;
            this.inflateRipple = {
                position: worldPosition.clone(),
                time: currentTime
            };

            return true;
        }

        return false;
    }

    /**
     * Update pull position as mouse moves (makes vertices follow the cursor)
     * @param {THREE.Vector2} mouseNDC - Mouse position in normalized device coordinates
     * @param {THREE.Camera} camera - Camera to use for raycasting
     */
    updatePullPosition(mouseNDC, camera) {
        if (!this.mesh || !this.inflateRipple) return;

        // Set up raycaster
        this.raycaster.setFromCamera(mouseNDC, camera);

        // Cast ray into scene - use a plane at the current pull depth
        const pullDepth = this.inflateRipple.position.distanceTo(camera.position);

        // Create a vector in NDC space and unproject it at the same depth
        const vector = new THREE.Vector3(mouseNDC.x, mouseNDC.y, 0.5);
        vector.unproject(camera);

        // Calculate direction from camera
        const dir = vector.sub(camera.position).normalize();

        // Calculate new position at same depth as original grab point
        const newPosition = camera.position.clone().add(dir.multiplyScalar(pullDepth));

        // Update pull position (vertices will follow this)
        this.inflateRipple.position.copy(newPosition);
    }

    /**
     * Handle mouse/touch release - convert to deflate ripple
     */
    handleRelease() {
        if (this.inflateRipple) {
            // Convert inflate to deflate ripple
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
        if (this.mesh) {
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
        }
    }
}

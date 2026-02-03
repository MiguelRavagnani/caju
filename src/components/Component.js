import * as THREE from 'three';

/**
 * Base class for 3D components with common lifecycle and behaviors
 */
export class Component {
    constructor(config = {}) {
        this.mesh = null;
        this.time = 0;
        this.config = config;
        this._disposed = false;
        this._loaded = false;

        // Billboard support (lazy init)
        this._billboard = null;
    }

    // --- Lifecycle ---

    /**
     * Override to load assets. Call _onLoad() when done.
     * @returns {Promise<void>}
     */
    async load() {
        // Override in subclass
    }

    /**
     * Call from subclass when loading completes
     * @param {Function} callback - Optional callback to invoke
     */
    _onLoad(callback) {
        this._loaded = true;
        if (callback) callback(this);
    }

    /**
     * Update component state. Called every frame.
     * @param {THREE.Camera} camera
     * @param {number} deltaTime
     */
    update(camera, deltaTime = 0.016) {
        if (!this.mesh || this._disposed) return;
        this.time += deltaTime;
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this._disposed) return;
        this._disposed = true;

        if (this.mesh) {
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    this._disposeMaterial(child.material);
                }
            });
        }
    }

    _disposeMaterial(material) {
        if (!material) return;

        // Handle material arrays
        const materials = Array.isArray(material) ? material : [material];
        for (const mat of materials) {
            // Dispose all textures
            for (const key of Object.keys(mat)) {
                const value = mat[key];
                if (value?.isTexture) {
                    value.dispose();
                }
            }
            mat.dispose();
        }
    }

    // --- Accessors ---

    getMesh() {
        return this.mesh;
    }

    isLoaded() {
        return this._loaded;
    }

    // --- Billboard behavior ---

    /**
     * Enable billboard behavior (face camera with optional lag)
     * @param {number} lag - Slerp factor (0-1), lower = smoother
     */
    enableBillboard(lag = 0.03) {
        this._billboard = {
            lag,
            current: new THREE.Quaternion(),
            target: new THREE.Quaternion(),
            helper: new THREE.Object3D()
        };
    }

    /**
     * Update billboard rotation. Call from update() if enabled.
     * @param {THREE.Camera} camera
     */
    updateBillboard(camera) {
        if (!this._billboard || !this.mesh || !camera) return;

        const { lag, current, target, helper } = this._billboard;

        helper.position.copy(this.mesh.position);
        helper.lookAt(camera.position);
        target.copy(helper.quaternion);

        current.copy(this.mesh.quaternion);
        current.slerp(target, lag);
        this.mesh.quaternion.copy(current);
    }

    // --- Float animation ---

    /**
     * Calculate vertical float offset
     * @param {number} amount - Max displacement
     * @param {number} speed - Animation speed
     * @param {number} phase - Phase offset
     * @returns {number}
     */
    getFloatOffset(amount = 0.05, speed = 0.5, phase = 0) {
        return Math.sin(this.time * speed + phase) * amount;
    }

    // --- Position helpers ---

    setPosition(x, y, z) {
        if (this.mesh) {
            this.mesh.position.set(x, y, z);
        }
    }

    getPosition() {
        return this.mesh?.position;
    }
}

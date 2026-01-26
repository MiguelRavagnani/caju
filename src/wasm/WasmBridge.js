/**
 * WASM Bridge - Loader and manager for performance-critical WASM modules
 *
 * Currently provides:
 *   - MatrixComputer: Fast matrix inverse/normal computations
 *   - BVHRaycaster: Accelerated ray-mesh intersection
 *
 * Usage:
 *   import { WasmBridge } from './wasm/WasmBridge.js';
 *   await WasmBridge.initialize();
 *   if (WasmBridge.isReady()) {
 *     const inverse = WasmBridge.computeInverseMatrix(matrix);
 *   }
 */

let wasmModule = null;

class WasmBridgeClass {
    constructor() {
        this.ready = false;
        this.readyPromise = null;
        this.initError = null;
        this._matrix = null;
        this._raycasters = new Map();
    }

    /**
     * Initialize WASM modules (call once at app startup)
     */
    async initialize() {
        if (this.readyPromise) {
            return this.readyPromise;
        }
        this.readyPromise = this._doInitialize();
        return this.readyPromise;
    }

    async _doInitialize() {
        try {
            wasmModule = await import('../../wasm/pkg/caju_wasm.js');
            await wasmModule.default();

            if (wasmModule.MatrixComputer) {
                this._matrix = new wasmModule.MatrixComputer();
            }

            this.ready = true;
            console.log('[WASM] Modules initialized');
            return true;
        } catch (error) {
            this.initError = error;
            this.ready = false;
            console.warn('[WASM] Init failed, using JS fallback:', error.message);
            return false;
        }
    }

    isReady() {
        return this.ready;
    }

    getError() {
        return this.initError;
    }

    // ============================================
    // Matrix Operations
    // ============================================

    /**
     * Compute inverse of a Three.js matrix
     * @param {THREE.Matrix4} threeMatrix
     * @returns {Float32Array|null}
     */
    computeInverseMatrix(threeMatrix) {
        if (!this.ready || !this._matrix) return null;
        this._matrix.update_model(threeMatrix.elements);
        return new Float32Array(this._matrix.get_inverse_model());
    }

    /**
     * Compute normal matrix from a Three.js matrix
     * @param {THREE.Matrix4} threeMatrix
     * @returns {Float32Array|null}
     */
    computeNormalMatrix(threeMatrix) {
        if (!this.ready || !this._matrix) return null;
        this._matrix.update_model(threeMatrix.elements);
        return new Float32Array(this._matrix.get_normal_matrix());
    }

    // ============================================
    // Raycasting
    // ============================================

    /**
     * Create a BVH raycaster for a mesh
     * @param {string} id - Unique identifier
     * @param {Float32Array} positions - Vertex positions [x,y,z,...]
     * @param {Uint32Array} indices - Triangle indices
     * @returns {object|null}
     */
    createRaycaster(id, positions, indices) {
        if (!this.ready || !wasmModule?.BVHRaycaster) return null;

        try {
            const raycaster = new wasmModule.BVHRaycaster(positions, indices);
            this._raycasters.set(id, raycaster);
            return raycaster;
        } catch (error) {
            console.warn('[WASM] Failed to create raycaster:', error);
            return null;
        }
    }

    /**
     * Perform raycast using WASM BVH
     * @param {string} id - Raycaster ID
     * @param {THREE.Vector3} origin
     * @param {THREE.Vector3} direction
     * @param {THREE.Matrix4} modelMatrix
     * @returns {{point: object, normal: object, distance: number}|null}
     */
    raycast(id, origin, direction, modelMatrix) {
        const raycaster = this._raycasters.get(id);
        if (!raycaster) return null;

        const result = raycaster.intersect(
            [origin.x, origin.y, origin.z],
            [direction.x, direction.y, direction.z],
            modelMatrix.elements
        );

        if (!result) return null;

        return {
            point: { x: result[0], y: result[1], z: result[2] },
            normal: { x: result[3], y: result[4], z: result[5] },
            distance: result[6]
        };
    }

    /**
     * Dispose of a specific raycaster
     * @param {string} id
     */
    disposeRaycaster(id) {
        this._raycasters.delete(id);
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this._raycasters.clear();
        this._matrix = null;
        this.ready = false;
    }
}

// Singleton instance
export const WasmBridge = new WasmBridgeClass();

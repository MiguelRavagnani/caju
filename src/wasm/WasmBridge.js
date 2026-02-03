/**
 * WASM Bridge - Loader and manager for performance-critical WASM modules
 *
 * Currently provides:
 *   - MatrixComputer: Fast matrix inverse/normal computations
 *   - BVHRaycaster: Accelerated ray-mesh intersection
 *   - TextureGenerator: Pre-computed noise/LUT textures for shaders
 *   - RippleSimulator: Physics-based vertex displacement for ripple effects
 *
 * Usage:
 *   import { WasmBridge } from './wasm/WasmBridge.js';
 *   await WasmBridge.initialize();
 *   if (WasmBridge.isReady()) {
 *     const inverse = WasmBridge.computeInverseMatrix(matrix);
 *   }
 */

let wasmModule = null;
let wasmMemory = null;

class WasmBridgeClass {
    constructor() {
        this.ready = false;
        this.readyPromise = null;
        this.initError = null;
        this._matrix = null;
        this._raycasters = new Map();
        this._rippleSimulators = new Map();
        this._textureGen = null;
        // Zero-copy output views into WASM memory
        this._inverseView = null;
        this._normalView = null;
        this._mvpView = null;
        // SharedArrayBuffer support (true zero-copy input)
        this._sharedSupported = false;
        this._inputView = null;
        this._viewMatrixView = null;
        this._projectionView = null;
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
            // default() returns the wasm exports which includes memory
            const wasmExports = await wasmModule.default();
            wasmMemory = wasmExports.memory;

            if (wasmModule.MatrixComputer) {
                this._matrix = new wasmModule.MatrixComputer();
                this._setupZeroCopyViews();
                this._checkSharedArrayBufferSupport();
            }

            if (wasmModule.TextureGenerator) {
                this._textureGen = new wasmModule.TextureGenerator(Date.now() & 0xffffffff);
            }

            this.ready = true;
            const sharedStatus = this._sharedSupported ? 'SharedArrayBuffer enabled' : 'SharedArrayBuffer unavailable';
            console.log(`[WASM] Modules initialized (zero-copy output, ${sharedStatus})`);
            return true;
        } catch (error) {
            this.initError = error;
            this.ready = false;
            console.warn('[WASM] Init failed, using JS fallback:', error.message);
            return false;
        }
    }

    /**
     * Setup Float32Array views directly into WASM memory (zero-copy)
     */
    _setupZeroCopyViews() {
        if (!this._matrix || !wasmMemory) return;

        const inversePtr = this._matrix.get_inverse_ptr();
        const normalPtr = this._matrix.get_normal_ptr();
        const mvpPtr = this._matrix.get_mvp_ptr();

        // Create views directly into WASM memory - no copying!
        this._inverseView = new Float32Array(wasmMemory.buffer, inversePtr, 16);
        this._normalView = new Float32Array(wasmMemory.buffer, normalPtr, 16);
        this._mvpView = new Float32Array(wasmMemory.buffer, mvpPtr, 16);
    }

    /**
     * Refresh views if WASM memory was resized (rare but possible)
     */
    _refreshViewsIfNeeded() {
        if (this._inverseView && this._inverseView.buffer !== wasmMemory.buffer) {
            this._setupZeroCopyViews();
        }
    }

    /**
     * Check if SharedArrayBuffer is available and set up shared input views
     * Requires CORS headers: Cross-Origin-Opener-Policy: same-origin
     *                        Cross-Origin-Embedder-Policy: require-corp
     */
    _checkSharedArrayBufferSupport() {
        if (!this._matrix || !wasmMemory) return;

        // Check if SharedArrayBuffer is available (requires CORS headers)
        if (typeof SharedArrayBuffer === 'undefined' || !crossOriginIsolated) {
            this._sharedSupported = false;
            console.log('[WASM] SharedArrayBuffer not available (missing CORS headers)');
            return;
        }

        try {
            // Get pointers to shared input buffers
            const inputPtr = this._matrix.get_input_ptr();
            const viewPtr = this._matrix.get_view_ptr();
            const projectionPtr = this._matrix.get_projection_ptr();

            // Create views for writing input data directly to WASM memory
            this._inputView = new Float32Array(wasmMemory.buffer, inputPtr, 16);
            this._viewMatrixView = new Float32Array(wasmMemory.buffer, viewPtr, 16);
            this._projectionView = new Float32Array(wasmMemory.buffer, projectionPtr, 16);

            this._sharedSupported = true;
            console.log('[WASM] SharedArrayBuffer input views ready');
        } catch (e) {
            this._sharedSupported = false;
            console.warn('[WASM] Failed to setup shared input views:', e.message);
        }
    }

    isReady() {
        return this.ready;
    }

    getError() {
        return this.initError;
    }

    /**
     * Get the matrix computer instance (for benchmarking)
     */
    get matrixComputer() {
        return this._matrix;
    }

    // --- Matrix Operations (Zero-Copy) ---

    /**
     * Compute inverse matrix - ZERO COPY
     * Returns a view directly into WASM memory (no allocation per call)
     * @param {Float32Array} elements - Matrix elements (16 floats)
     * @returns {Float32Array} - View into WASM memory (do not store long-term!)
     */
    invertMatrixZeroCopy(elements) {
        if (!this.ready || !this._matrix) return null;
        this._refreshViewsIfNeeded();
        this._matrix.invert_inplace(elements);
        return this._inverseView;
    }

    /**
     * Compute normal matrix - ZERO COPY
     * @param {Float32Array} elements - Model matrix elements
     * @returns {Float32Array} - View into WASM memory
     */
    normalMatrixZeroCopy(elements) {
        if (!this.ready || !this._matrix) return null;
        this._refreshViewsIfNeeded();
        this._matrix.normal_inplace(elements);
        return this._normalView;
    }

    /**
     * Compute MVP matrix - ZERO COPY
     * @param {Float32Array} model - Model matrix elements
     * @param {Float32Array} view - View matrix elements
     * @param {Float32Array} projection - Projection matrix elements
     * @returns {Float32Array} - View into WASM memory
     */
    mvpMatrixZeroCopy(model, view, projection) {
        if (!this.ready || !this._matrix) return null;
        this._refreshViewsIfNeeded();
        this._matrix.mvp_inplace(model, view, projection);
        return this._mvpView;
    }

    // --- SharedArrayBuffer (true zero-copy) ---

    /**
     * Check if SharedArrayBuffer is supported
     */
    isSharedSupported() {
        return this._sharedSupported;
    }

    /**
     * Compute inverse matrix - TRUE ZERO COPY (SharedArrayBuffer)
     * Writes input directly to WASM memory, no copying in either direction
     * @param {Float32Array} elements - Matrix elements (16 floats)
     * @returns {Float32Array} - View into WASM memory
     */
    invertMatrixShared(elements) {
        if (!this.ready || !this._matrix || !this._sharedSupported) return null;
        this._refreshViewsIfNeeded();
        // Write input directly to WASM memory (single set operation)
        this._inputView.set(elements);
        // Compute - no parameter passing, reads from internal buffer
        this._matrix.invert_shared();
        return this._inverseView;
    }

    /**
     * Compute normal matrix - TRUE ZERO COPY (SharedArrayBuffer)
     * @param {Float32Array} elements - Model matrix elements
     * @returns {Float32Array} - View into WASM memory
     */
    normalMatrixShared(elements) {
        if (!this.ready || !this._matrix || !this._sharedSupported) return null;
        this._refreshViewsIfNeeded();
        this._inputView.set(elements);
        this._matrix.normal_shared();
        return this._normalView;
    }

    /**
     * Compute MVP matrix - TRUE ZERO COPY (SharedArrayBuffer)
     * @param {Float32Array} model - Model matrix elements
     * @param {Float32Array} view - View matrix elements
     * @param {Float32Array} projection - Projection matrix elements
     * @returns {Float32Array} - View into WASM memory
     */
    mvpMatrixShared(model, view, projection) {
        if (!this.ready || !this._matrix || !this._sharedSupported) return null;
        this._refreshViewsIfNeeded();
        this._inputView.set(model);
        this._viewMatrixView.set(view);
        this._projectionView.set(projection);
        this._matrix.mvp_shared();
        return this._mvpView;
    }

    // --- Matrix Operations (Legacy, allocates) ---

    /**
     * Compute inverse of a Three.js matrix (legacy, allocates)
     * @param {THREE.Matrix4} threeMatrix
     * @returns {Float32Array|null}
     */
    computeInverseMatrix(threeMatrix) {
        if (!this.ready || !this._matrix) return null;
        this._matrix.update_model(threeMatrix.elements);
        return new Float32Array(this._matrix.get_inverse_model());
    }

    /**
     * Compute normal matrix from a Three.js matrix (legacy, allocates)
     * @param {THREE.Matrix4} threeMatrix
     * @returns {Float32Array|null}
     */
    computeNormalMatrix(threeMatrix) {
        if (!this.ready || !this._matrix) return null;
        this._matrix.update_model(threeMatrix.elements);
        return new Float32Array(this._matrix.get_normal_matrix());
    }

    // --- Raycasting ---

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

    // --- Texture Generation ---

    /**
     * Generate a tileable noise texture
     * @param {number} size - Texture size (power of 2, e.g., 256)
     * @returns {Uint8Array|null} - RGBA pixel data
     */
    generateNoiseTexture(size) {
        if (!this.ready || !this._textureGen) return null;
        return new Uint8Array(this._textureGen.generate_noise(size));
    }

    /**
     * Generate blue noise texture (better for film grain)
     * @param {number} size - Texture size (power of 2)
     * @returns {Uint8Array|null} - RGBA pixel data
     */
    generateBlueNoiseTexture(size) {
        if (!this.ready || !this._textureGen) return null;
        return new Uint8Array(this._textureGen.generate_blue_noise(size));
    }

    /**
     * Generate color grading LUT
     * @param {number} size - LUT resolution (e.g., 32)
     * @param {number} contrast - Contrast multiplier (1.0 = neutral)
     * @param {number} saturation - Saturation multiplier (1.0 = neutral)
     * @returns {Uint8Array|null} - RGBA pixel data (size*size x size)
     */
    generateColorLUT(size, contrast = 1.0, saturation = 1.0) {
        if (!this.ready || !this._textureGen) return null;
        return new Uint8Array(this._textureGen.generate_color_lut(size, contrast, saturation));
    }

    // --- Ripple Physics ---

    /**
     * Create a ripple simulator for mesh vertex displacement
     * @param {string} id - Unique identifier
     * @param {number} vertexCount - Number of vertices in the mesh
     * @returns {object|null} - The simulator instance
     */
    createRippleSimulator(id, vertexCount) {
        if (!this.ready || !wasmModule?.RippleSimulator) return null;

        try {
            const simulator = new wasmModule.RippleSimulator();
            this._rippleSimulators.set(id, simulator);
            return simulator;
        } catch (error) {
            console.warn('[WASM] Failed to create ripple simulator:', error);
            return null;
        }
    }

    /**
     * Get an existing ripple simulator
     * @param {string} id - Simulator ID
     * @returns {object|null}
     */
    getRippleSimulator(id) {
        return this._rippleSimulators.get(id) || null;
    }

    /**
     * Add a ripple at world position (state-only, WASM manages lifecycle)
     * @param {string} id - Simulator ID
     * @param {THREE.Vector3} position - World position
     * @param {number} amplitude - Wave height magnitude (e.g., 0.5)
     * @param {number} speed - Propagation speed (e.g., 5.0)
     * @param {number} decay - Amplitude decay per frame (e.g., 0.95)
     * @param {RippleType} rippleType - RippleType.Wave (0) or RippleType.Pull (1)
     * @returns {void}
     */
    addRipple(id, position, amplitude, speed, decay, rippleType = 0) {
        const simulator = this._rippleSimulators.get(id);
        if (!simulator) return;
        simulator.add_ripple(position.x, position.y, position.z, amplitude, speed, decay, rippleType);
    }

    /**
     * Update ripple simulator physics (call once per frame)
     * @param {string} id - Simulator ID
     * @param {number} deltaTime - Time delta in seconds
     * @returns {void}
     */
    updateRipples(id, deltaTime) {
        const simulator = this._rippleSimulators.get(id);
        if (!simulator) return;
        simulator.update(deltaTime);
    }

    /**
     * Get ripple uniform data for GPU shader (state-only)
     * Returns flat array: [pos.x, pos.y, pos.z, radius, amplitude, phase, type, active] per ripple
     * @param {string} id - Simulator ID
     * @returns {Float32Array|null} - Uniform data for shader
     */
    getRippleUniforms(id) {
        const simulator = this._rippleSimulators.get(id);
        if (!simulator) return null;
        return new Float32Array(simulator.get_uniforms());
    }

    /**
     * Dispose of a specific ripple simulator
     * @param {string} id - Simulator ID
     */
    disposeRippleSimulator(id) {
        this._rippleSimulators.delete(id);
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this._raycasters.clear();
        this._rippleSimulators.clear();
        this._matrix = null;
        this._textureGen = null;
        this.ready = false;
    }
}

// Singleton instance
export const WasmBridge = new WasmBridgeClass();

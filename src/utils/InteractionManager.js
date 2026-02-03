import { normalizeMouseCoords } from './Constants.js';
import { HybridRaycaster } from './HybridRaycaster.js';

/**
 * Manages click interactions on 3D objects
 */
export class InteractionManager {
    /**
     * @param {THREE.Camera} camera
     * @param {THREE.Object3D[]} objects - Objects to test for hits
     * @param {Object} options
     * @param {Function} [options.onHit] - Callback when object is clicked: (hit) => void
     * @param {string} [options.raycasterId] - WASM raycaster ID (default: 'caju')
     */
    constructor(camera, objects = [], { onHit = null, raycasterId = 'caju' } = {}) {
        this.camera = camera;
        this.objects = objects;
        this.onHit = onHit;
        this._raycaster = new HybridRaycaster(raycasterId);

        this._onClick = this._onClick.bind(this);
        window.addEventListener('click', this._onClick);
    }

    _onClick(event) {
        const ndc = normalizeMouseCoords(event.clientX, event.clientY);
        const hit = this._raycaster.cast(this.camera, this.objects, ndc);

        if (hit && this.onHit) {
            this.onHit(hit);
        }
    }

    addObject(object) {
        this.objects.push(object);
    }

    removeObject(object) {
        const index = this.objects.indexOf(object);
        if (index > -1) {
            this.objects.splice(index, 1);
        }
    }

    dispose() {
        window.removeEventListener('click', this._onClick);
    }
}

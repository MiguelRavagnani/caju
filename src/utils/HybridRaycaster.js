import * as THREE from 'three';
import { WasmBridge } from '../wasm/WasmBridge.js';

/**
 * Raycaster that uses WASM BVH when available, falls back to Three.js
 */
export class HybridRaycaster {
    constructor(wasmId = 'caju') {
        this.wasmId = wasmId;
        this._raycaster = new THREE.Raycaster();
    }

    /**
     * Cast ray and return first hit
     * @param {THREE.Camera} camera
     * @param {THREE.Object3D[]} objects
     * @param {{x: number, y: number}} ndc - Normalized device coordinates
     * @returns {{object: THREE.Object3D, point: THREE.Vector3} | null}
     */
    cast(camera, objects, ndc) {
        this._raycaster.setFromCamera(ndc, camera);

        return WasmBridge.isReady()
            ? this._castWasm(objects)
            : this._castThree(objects);
    }

    _castThree(objects) {
        console.log('Using Three.js raycaster fallback');
        const intersects = this._raycaster.intersectObjects(objects);
        if (intersects.length === 0) return null;

        return {
            object: intersects[0].object,
            point: intersects[0].point
        };
    }

    _castWasm(objects) {
        console.log('Using Three.js raycaster fallback');
        const ray = this._raycaster.ray;

        for (const object of objects) {
            const result = WasmBridge.raycast(
                this.wasmId,
                ray.origin,
                ray.direction,
                object.matrixWorld
            );

            if (result) {
                return {
                    object,
                    point: new THREE.Vector3(result.point.x, result.point.y, result.point.z)
                };
            }
        }

        return null;
    }
}

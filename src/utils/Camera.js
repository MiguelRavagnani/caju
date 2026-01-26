import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Camera {
    constructor(renderer) {
        this.camera = new THREE.PerspectiveCamera(
            30,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        // Position camera further away for a smaller, more centered view
        this.camera.position.set(0, 0, 18);

        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);

        // Setup orbit controls
        this.controls = new OrbitControls(this.camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 3;
        this.controls.maxDistance = 20;

        // Center the controls target on the model (origin)
        this.controls.target.set(0, 0, 0);
    }

    update() {
        this.controls.update();
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }

    getCamera() {
        return this.camera;
    }

    getControls() {
        return this.controls;
    }

    getAudioListener() {
        return this.listener;
    }

    /**
     * Enable camera controls
     */
    enableControls() {
        this.controls.enabled = true;
    }

    /**
     * Disable camera controls (freeze camera)
     */
    disableControls() {
        this.controls.enabled = false;
    }
}

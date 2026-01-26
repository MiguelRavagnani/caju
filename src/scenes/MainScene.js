import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

export class MainScene {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#7a668a');

        this.setupLighting();
        this.loadHDRI();
        // this.setupGrid();
    }

    setupLighting() {
        // Main directional light (like sun)
        const directionalLight = new THREE.DirectionalLight('#fffdf2', 2.0);
        directionalLight.position.set(5, 10, 7.5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        // Fill light from opposite side
        const fillLight = new THREE.DirectionalLight('#197dff', 3.3);
        fillLight.position.set(-5, 5, -5);
        this.scene.add(fillLight);

        // Rim light for edge definition
        const rimLight = new THREE.PointLight('#fa2e2e', 2.5);
        rimLight.position.set(0, 3, -8);
        this.scene.add(rimLight);
    }

    loadHDRI() {
        const hdrLoader = new HDRLoader();

        // Load HDR environment map
        hdrLoader.load('./assets/hdri/environment.hdr', (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;

            // Set as environment map (for reflections)
            this.scene.environment = texture;

            // Optionally set as background (uncomment to use HDR as background)
            // this.scene.background = texture;
        });
    }

    setupGrid() {
        // Grid helper to visualize units
        // Parameters: size (total size), divisions (number of grid squares)
        const gridHelper = new THREE.GridHelper(10, 10, '#888888', '#444444');
        this.scene.add(gridHelper);

        // Optional: Add axes helper to show X (red), Y (green), Z (blue) axes
        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);
    }

    add(object) {
        this.scene.add(object);
    }

    remove(object) {
        this.scene.remove(object);
    }

    getScene() {
        return this.scene;
    }
}

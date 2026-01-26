import * as THREE from 'three';

export class InteractionManager {
    constructor(camera, objects = []) {
        this.camera = camera;
        this.objects = objects;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.setupEventListeners();
    }

    setupEventListeners() {
        window.addEventListener('click', this.onMouseClick.bind(this));
    }

    onMouseClick(event) {
        // Calculate mouse position in normalized device coordinates
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        // Update the raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for intersections
        const intersects = this.raycaster.intersectObjects(this.objects);

        if (intersects.length > 0) {
            const clickedObject = intersects[0].object;
            this.onObjectClick(clickedObject);
        }
    }

    onObjectClick() {
        // Placeholder for click interactions
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
        window.removeEventListener('click', this.onMouseClick.bind(this));
    }
}

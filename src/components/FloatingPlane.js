import * as THREE from 'three';

export class FloatingPlane {
    constructor(texturePath, onLoad, config = {}) {
        this.mesh = null;
        this.time = 0;
        this.config = {
            position: config.position || { x: 0, y: 3, z: 0 },
            scale: config.scale || 1.0,
            aspectRatio: config.aspectRatio || 2.0, // width/height ratio
            floatAmount: config.floatAmount || 0.05,
            floatSpeed: config.floatSpeed || 0.5,
            rotationLag: config.rotationLag || 0.03,
            phaseOffset: config.phaseOffset || 0,
            opacity: config.opacity || 1.0,
            renderOnTop: config.renderOnTop ?? false // Always render on top of other objects
        };

        // For smooth delayed rotation (billboard effect)
        this.currentQuaternion = new THREE.Quaternion();
        this.targetQuaternion = new THREE.Quaternion();
        this.lookAtHelper = new THREE.Object3D();
        this.baseY = this.config.position.y;

        this.loadTexture(texturePath, onLoad);
    }

    loadTexture(texturePath, onLoad) {
        const textureLoader = new THREE.TextureLoader();

        textureLoader.load(texturePath, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;

            // Create plane geometry based on scale and aspect ratio
            const width = this.config.scale * this.config.aspectRatio;
            const height = this.config.scale;
            const geometry = new THREE.PlaneGeometry(width, height);

            // Create material with transparency
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: this.config.opacity,
                side: THREE.DoubleSide,
                depthWrite: !this.config.renderOnTop,
                depthTest: !this.config.renderOnTop,
                alphaTest: 0.1
            });

            this.mesh = new THREE.Mesh(geometry, material);

            // Render on top of everything else
            if (this.config.renderOnTop) {
                this.mesh.renderOrder = 999;
            }

            this.mesh.position.set(
                this.config.position.x,
                this.config.position.y,
                this.config.position.z
            );

            if (onLoad) {
                onLoad(this);
            }
        });
    }

    getMesh() {
        return this.mesh;
    }

    update(camera, deltaTime = 0.016) {
        if (!this.mesh) return;

        this.time += deltaTime;

        // Billboard with staggered/delayed rotation
        if (camera) {
            this.lookAtHelper.position.copy(this.mesh.position);
            this.lookAtHelper.lookAt(camera.position);
            this.targetQuaternion.copy(this.lookAtHelper.quaternion);

            this.currentQuaternion.copy(this.mesh.quaternion);
            this.currentQuaternion.slerp(this.targetQuaternion, this.config.rotationLag);
            this.mesh.quaternion.copy(this.currentQuaternion);
        }

        // Floating animation with phase offset
        const phase = this.time * this.config.floatSpeed + this.config.phaseOffset;
        const floatY = Math.sin(phase) * this.config.floatAmount;
        this.mesh.position.y = this.baseY + floatY;
    }

    setPosition(x, y, z) {
        this.config.position = { x, y, z };
        this.baseY = y;
        if (this.mesh) {
            this.mesh.position.set(x, y, z);
        }
    }

    setOpacity(opacity) {
        this.config.opacity = opacity;
        if (this.mesh) {
            this.mesh.material.opacity = opacity;
        }
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            if (this.mesh.material.map) {
                this.mesh.material.map.dispose();
            }
            this.mesh.material.dispose();
        }
    }
}

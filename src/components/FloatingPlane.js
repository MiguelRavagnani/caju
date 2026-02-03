import * as THREE from 'three';
import { Component } from './Component.js';

export class FloatingPlane extends Component {
    constructor(texturePath, onLoad, config = {}) {
        super({
            position: config.position || { x: 0, y: 3, z: 0 },
            scale: config.scale || 1.0,
            aspectRatio: config.aspectRatio || 2.0,
            floatAmount: config.floatAmount || 0.05,
            floatSpeed: config.floatSpeed || 0.5,
            rotationLag: config.rotationLag || 0.03,
            phaseOffset: config.phaseOffset || 0,
            opacity: config.opacity || 1.0,
            renderOnTop: config.renderOnTop ?? false
        });

        this.baseY = this.config.position.y;
        this.enableBillboard(this.config.rotationLag);
        this.loadTexture(texturePath, onLoad);
    }

    loadTexture(texturePath, onLoad) {
        const loader = new THREE.TextureLoader();

        loader.load(texturePath, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;

            const { scale, aspectRatio, opacity, renderOnTop, position } = this.config;
            const geometry = new THREE.PlaneGeometry(scale * aspectRatio, scale);

            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity,
                side: THREE.DoubleSide,
                depthWrite: !renderOnTop,
                depthTest: !renderOnTop,
                alphaTest: 0.1
            });

            this.mesh = new THREE.Mesh(geometry, material);

            if (renderOnTop) {
                this.mesh.renderOrder = 999;
            }

            this.mesh.position.set(position.x, position.y, position.z);
            this._onLoad(onLoad);
        });
    }

    update(camera, deltaTime = 0.016) {
        super.update(camera, deltaTime);
        if (!this.mesh) return;

        this.updateBillboard(camera);

        const floatY = this.getFloatOffset(
            this.config.floatAmount,
            this.config.floatSpeed,
            this.config.phaseOffset
        );
        this.mesh.position.y = this.baseY + floatY;
    }

    setPosition(x, y, z) {
        this.config.position = { x, y, z };
        this.baseY = y;
        super.setPosition(x, y, z);
    }

    setOpacity(opacity) {
        this.config.opacity = opacity;
        if (this.mesh) {
            this.mesh.material.opacity = opacity;
        }
    }
}

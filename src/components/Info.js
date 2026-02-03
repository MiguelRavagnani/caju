import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { CONFIG } from '../utils/Constants.js';
import { Component } from './Component.js';

export class Info extends Component {
    constructor(onLoad, config = {}) {
        super({
            position: config.position || { x: 0, y: 3, z: 0 },
            scale: config.scale || 1.0,
            floatAmount: config.floatAmount || 0.05,
            floatSpeed: config.floatSpeed || 0.5,
            rotationAmount: config.rotationAmount || 0.02,
            rotationOffset: config.rotationOffset || { x: 0.2, y: -0.7, z: -0.2 },
            attachPoint: config.attachPoint || { x: 0, y: 2, z: 0 },
            stringColor: config.stringColor || '#41384b',
            stringSag: config.stringSag || 1.0,
            rotationLag: config.rotationLag || 0.03,
            stringWidth: config.stringWidth || 4
        });

        this.enableBillboard(this.config.rotationLag);

        // String/line properties
        this.stringLine = null;
        this.stringMaterial = null;
        this.stringGeometry = null;
        this.targetPosition = new THREE.Vector3();

        // Pre-allocated vectors for string curve (zero GC)
        this._startPos = new THREE.Vector3();
        this._endPos = new THREE.Vector3();
        this._midPoint = new THREE.Vector3();
        this._controlPoint1 = new THREE.Vector3();
        this._controlPoint2 = new THREE.Vector3();
        this._curvePoints = [
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3(),
            new THREE.Vector3()
        ];
        this._stringCurve = new THREE.CatmullRomCurve3(this._curvePoints);

        // Pre-allocate curve sampling
        this._stringSegments = 32;
        this._sampledPoints = [];
        for (let i = 0; i <= this._stringSegments; i++) {
            this._sampledPoints.push(new THREE.Vector3());
        }
        this._flatPositions = new Float32Array((this._stringSegments + 1) * 3);

        this.loadModel(onLoad);
    }

    loadModel(onLoad) {
        const loader = new GLTFLoader();
        const textureLoader = new THREE.TextureLoader();

        const baseColorMap = textureLoader.load(CONFIG.TEXTURE_PATHS.infoBaseColor);
        const normalMap = textureLoader.load(CONFIG.TEXTURE_PATHS.infoNormal);
        const ormMap = textureLoader.load(CONFIG.TEXTURE_PATHS.infoORM);

        baseColorMap.colorSpace = THREE.SRGBColorSpace;
        normalMap.colorSpace = THREE.LinearSRGBColorSpace;
        ormMap.colorSpace = THREE.LinearSRGBColorSpace;

        baseColorMap.flipY = false;
        normalMap.flipY = false;
        ormMap.flipY = false;

        loader.load(CONFIG.MODEL_PATHS.info, (gltf) => {
            this.mesh = gltf.scene;

            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    const material = new THREE.MeshStandardMaterial({
                        map: baseColorMap,
                        normalMap: normalMap,
                        aoMap: ormMap,
                        roughnessMap: ormMap,
                        metalnessMap: ormMap,
                        aoMapIntensity: 1.0,
                        roughness: 1.0,
                        metalness: 1.0
                    });

                    if (!child.geometry.attributes.uv2 && child.geometry.attributes.uv) {
                        child.geometry.setAttribute('uv2', child.geometry.attributes.uv);
                    }

                    child.material = material;
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            const { position, scale } = this.config;
            this.mesh.position.set(position.x, position.y, position.z);
            this.mesh.scale.setScalar(scale);

            this.createString();
            this._onLoad(onLoad);
        });
    }

    createString() {
        this.stringMaterial = new LineMaterial({
            color: this.config.stringColor,
            linewidth: this.config.stringWidth,
            dashed: true,
            dashSize: 0.15,
            gapSize: 0.12,
            resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
        });

        this.stringGeometry = new LineGeometry();
        this.stringGeometry.setPositions([0, 0, 0, 0, -1, 0, 0, -2, 0]);

        this.stringLine = new Line2(this.stringGeometry, this.stringMaterial);
        this.stringLine.computeLineDistances();
    }

    getStringLine() {
        return this.stringLine;
    }

    setTargetPosition(position) {
        this.targetPosition.set(position.x, position.y, position.z);
    }

    update(camera, deltaTime = 0.016, targetPosition = null) {
        super.update(camera, deltaTime);
        if (!this.mesh) return;

        this.updateBillboard(camera);

        if (targetPosition) {
            this.targetPosition.set(targetPosition.x, targetPosition.y, targetPosition.z);
        }

        if (this.stringLine) {
            this.updateString();
        }
    }

    updateString() {
        this._startPos.copy(this.mesh.position);
        this._endPos.copy(this.targetPosition);

        // Catenary-like curve with sag
        this._midPoint.lerpVectors(this._startPos, this._endPos, 0.5);
        const distance = this._startPos.distanceTo(this._endPos);
        const sag = this.config.stringSag * (distance / 5);
        this._midPoint.y -= sag;

        // Control points for natural curve
        this._controlPoint1.lerpVectors(this._startPos, this._midPoint, 0.5);
        this._controlPoint1.y -= sag * 0.3;

        this._controlPoint2.lerpVectors(this._midPoint, this._endPos, 0.5);
        this._controlPoint2.y -= sag * 0.3;

        // Update curve points in place
        this._curvePoints[0].copy(this._startPos);
        this._curvePoints[1].copy(this._controlPoint1);
        this._curvePoints[2].copy(this._midPoint);
        this._curvePoints[3].copy(this._controlPoint2);
        this._curvePoints[4].copy(this._endPos);

        // Sample curve (zero allocation)
        for (let i = 0; i <= this._stringSegments; i++) {
            const t = i / this._stringSegments;
            this._stringCurve.getPoint(t, this._sampledPoints[i]);
            const idx = i * 3;
            this._flatPositions[idx] = this._sampledPoints[i].x;
            this._flatPositions[idx + 1] = this._sampledPoints[i].y;
            this._flatPositions[idx + 2] = this._sampledPoints[i].z;
        }

        this.stringGeometry.setPositions(this._flatPositions);
        this.stringLine.computeLineDistances();

        // Animate dash offset
        this.stringMaterial.dashOffset = -this.time * 0.5;
    }

    onWindowResize() {
        if (this.stringMaterial) {
            this.stringMaterial.resolution.set(window.innerWidth, window.innerHeight);
        }
    }

    dispose() {
        super.dispose();

        if (this.stringLine) {
            this.stringGeometry.dispose();
            this.stringMaterial.dispose();
        }
    }
}

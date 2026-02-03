import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { CONFIG } from '../utils/Constants.js';

export class Info {
    constructor(onLoad, config = {}) {
        this.mesh = null;
        this.time = 0;
        this.config = {
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
        };

        // String/line properties
        this.stringLine = null;
        this.stringMaterial = null;
        this.targetPosition = new THREE.Vector3();

        // For smooth delayed rotation
        this.currentQuaternion = new THREE.Quaternion();
        this.targetQuaternion = new THREE.Quaternion();
        this.lookAtHelper = new THREE.Object3D();
        
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

        // Pre-allocate curve sampling to avoid GC pressure
        this._stringSegments = 32;
        this._sampledPoints = [];
        for (let i = 0; i <= this._stringSegments; i++) {
            this._sampledPoints.push(new THREE.Vector3());
        }
        // Pre-allocate flat positions array for LineGeometry
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

            this.mesh.position.set(
                this.config.position.x,
                this.config.position.y,
                this.config.position.z
            );
            this.mesh.scale.setScalar(this.config.scale);

            this.createString();

            if (onLoad) {
                onLoad(this);
            }
        });
    }

    createString() {
        // Line2 material supports actual line width
        this.stringMaterial = new LineMaterial({
            color: this.config.stringColor,
            linewidth: this.config.stringWidth,
            dashed: true,
            dashSize: 0.15,
            gapSize: 0.12,
            resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
        });

        // Create initial geometry
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

    getMesh() {
        return this.mesh;
    }

    update(camera, deltaTime = 0.016, targetPosition = null) {
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

        // Update target position if provided
        if (targetPosition) {
            this.targetPosition.set(targetPosition.x, targetPosition.y, targetPosition.z);
        }

        // Update the string curve
        if (this.stringLine && this.mesh) {
            this.updateString();
        }
    }

    updateString() {
        this._startPos.copy(this.mesh.position);
        this._endPos.copy(this.targetPosition);

        // Calculate midpoint with sag (catenary-like curve)
        this._midPoint.lerpVectors(this._startPos, this._endPos, 0.5);
        const distance = this._startPos.distanceTo(this._endPos);
        const sag = this.config.stringSag * (distance / 5);
        this._midPoint.y -= sag;

        // Control points for natural curve
        this._controlPoint1.lerpVectors(this._startPos, this._midPoint, 0.5);
        this._controlPoint1.y -= sag * 0.3;

        this._controlPoint2.lerpVectors(this._midPoint, this._endPos, 0.5);
        this._controlPoint2.y -= sag * 0.3;

        // Update curve points in place (avoid recreating CatmullRomCurve3)
        this._curvePoints[0].copy(this._startPos);
        this._curvePoints[1].copy(this._controlPoint1);
        this._curvePoints[2].copy(this._midPoint);
        this._curvePoints[3].copy(this._controlPoint2);
        this._curvePoints[4].copy(this._endPos);

        // Sample curve into pre-allocated vectors (zero allocation)
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
        if (this.mesh) {
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    if (child.material) {
                        for (const key of Object.keys(child.material)) {
                            const value = child.material[key];
                            if (value && value.isTexture) {
                                value.dispose();
                            }
                        }
                        child.material.dispose();
                    }
                }
            });
        }

        if (this.stringLine) {
            this.stringGeometry.dispose();
            this.stringMaterial.dispose();
        }
    }
}

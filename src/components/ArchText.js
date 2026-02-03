import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { CONFIG } from '../utils/Constants.js';
import { Component } from './Component.js';

export class ArchText extends Component {
    constructor(scene, text = '', config = {}) {
        super({
            archRadius: config.archRadius || 3,
            archStartAngle: config.archStartAngle || Math.PI * 0.7,
            archEndAngle: config.archEndAngle || Math.PI * 0.3,
            archCenter: config.archCenter || { x: 0, y: 0, z: 0 },
            letterSize: config.letterSize || 0.4,
            tubeRadius: config.tubeRadius || 0.03,
            curveResolution: config.curveResolution || 30,
            tubeSegments: config.tubeSegments || 8,
            floatAmount: config.floatAmount || CONFIG.ANIMATION.FLOAT_AMOUNT,
            floatSpeed: config.floatSpeed || 1.5,
            wobbleAmount: config.wobbleAmount || CONFIG.ANIMATION.WOBBLE_AMOUNT,
            wobbleSpeed: config.wobbleSpeed || CONFIG.ANIMATION.WOBBLE_SPEED,
            letterSpacing: config.letterSpacing ?? 1.0,
            flickerEnabled: config.flickerEnabled ?? true,
            neonColor: config.neonColor || CONFIG.NEON.DEFAULT_COLOR,
            emissiveIntensity: config.emissiveIntensity || CONFIG.NEON.EMISSIVE_INTENSITY,
            position: config.position || { x: 0, y: 0, z: 0 }
        });

        this.scene = scene;
        this.mesh = new THREE.Group();
        this.font = null;
        this.letterMeshes = [];
        this.pendingText = text;
        this.isRevealed = false;

        this.neonColor = new THREE.Color(this.config.neonColor);

        this.material = new THREE.MeshStandardMaterial({
            color: this.neonColor,
            emissive: this.neonColor,
            emissiveIntensity: this.config.emissiveIntensity,
            metalness: 0.3,
            roughness: 0.4
        });

        this.mesh.position.set(
            this.config.position.x,
            this.config.position.y,
            this.config.position.z
        );

        this._loadFont();
        scene.add(this.mesh);
    }

    _loadFont() {
        const loader = new FontLoader();
        loader.load(
            CONFIG.FONT_PATHS.roboto,
            (font) => {
                this.font = font;
                if (this.pendingText) this.generateText(this.pendingText);
                this._onLoad();
            },
            undefined,
            (error) => console.error('ArchText font loading failed:', error)
        );
    }

    generateText(text) {
        if (!this.font) {
            this.pendingText = text;
            return;
        }

        this.clear();
        this.pendingText = text;

        const {
            archRadius,
            archStartAngle,
            archEndAngle,
            archCenter,
            letterSize,
            tubeRadius,
            letterSpacing
        } = this.config;

        const advances = [];
        let totalAdvance = 0;

        for (const char of text) {
            const a = 1.0;
            advances.push(a);
            totalAdvance += a;
        }

        const angleRange = archStartAngle - archEndAngle;
        const anglePerUnit = angleRange / totalAdvance;

        let cursor = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const advance = advances[i];
            const spacedAdvance = advance * letterSpacing;
            const angle = archStartAngle - (cursor + spacedAdvance * 0.5) * anglePerUnit;

            cursor += spacedAdvance;

            if (char === ' ') continue;

            const x = archCenter.x + Math.cos(angle) * archRadius;
            const y = archCenter.y + Math.sin(angle) * archRadius;

            const letterGroup = this._createLetter(char, letterSize, tubeRadius);
            if (!letterGroup) continue;

            letterGroup.position.set(x, y, 0);
            letterGroup.rotation.z = angle - Math.PI / 2;

            letterGroup.userData = {
                baseX: x,
                baseY: y,
                baseRotation: angle - Math.PI / 2,
                phaseOffset: i * 0.4 + Math.random() * 0.3,
                targetScale: this.isRevealed ? 1 : 0,
                currentScale: 0
            };

            letterGroup.scale.setScalar(0);
            letterGroup.visible = true;

            this.letterMeshes.push(letterGroup);
            this.mesh.add(letterGroup);
        }
    }

    _createLetter(char, size, tubeRadius) {
        const shapes = this.font.generateShapes(char, size);
        const letterGroup = new THREE.Group();
        const curveResolution = this.config.curveResolution;

        shapes.forEach((shape) => {
            const shapePoints = shape.getPoints(curveResolution);
            if (shapePoints.length >= 2) {
                const tubeMesh = this._createTubeFromPoints(shapePoints, tubeRadius);
                if (tubeMesh) letterGroup.add(tubeMesh);
            }

            if (shape.holes) {
                shape.holes.forEach((hole) => {
                    const holePoints = hole.getPoints(curveResolution);
                    if (holePoints.length >= 2) {
                        const holeTubeMesh = this._createTubeFromPoints(holePoints, tubeRadius);
                        if (holeTubeMesh) letterGroup.add(holeTubeMesh);
                    }
                });
            }
        });

        const box = new THREE.Box3().setFromObject(letterGroup);
        const center = box.getCenter(new THREE.Vector3());

        letterGroup.children.forEach((child) => {
            child.position.x -= center.x;
            child.position.y -= center.y;
        });

        return letterGroup;
    }

    _createTubeFromPoints(points2D, radius) {
        if (points2D.length < 2) return null;

        const points3D = points2D.map((p) => new THREE.Vector3(p.x, p.y, 0));
        points3D.push(points3D[0].clone());

        const curve = new THREE.CatmullRomCurve3(points3D, false);
        const pathSegments = Math.max(points2D.length, this.config.curveResolution);

        const tubeGeometry = new THREE.TubeGeometry(
            curve,
            pathSegments,
            radius,
            this.config.tubeSegments,
            false
        );

        const mesh = new THREE.Mesh(tubeGeometry, this.material);
        mesh.layers.enable(CONFIG.BLOOM_LAYER);
        return mesh;
    }

    update(camera, deltaTime) {
        super.update(camera, deltaTime);

        // Billboard
        if (camera) {
            this.mesh.quaternion.copy(camera.quaternion);
        }

        // Animate each letter
        this.letterMeshes.forEach((letterGroup) => {
            const data = letterGroup.userData;

            // Scale animation (pop in)
            const scaleDiff = data.targetScale - data.currentScale;
            data.currentScale += scaleDiff * Math.min(deltaTime * 8, 1);
            letterGroup.scale.setScalar(data.currentScale);

            if (data.currentScale > 0.1) {
                const phase = this.time * this.config.floatSpeed + data.phaseOffset;
                const wobblePhase = this.time * this.config.wobbleSpeed + data.phaseOffset * 1.3;

                const floatY = Math.sin(phase) * this.config.floatAmount;
                const floatX = Math.sin(phase * 0.7) * this.config.floatAmount * 0.5;
                const wobble = Math.sin(wobblePhase) * this.config.wobbleAmount;

                letterGroup.position.x = data.baseX + floatX;
                letterGroup.position.y = data.baseY + floatY;
                letterGroup.rotation.z = data.baseRotation + wobble;
            }
        });

        // Neon flicker
        if (this.config.flickerEnabled) {
            const flicker = 1 + Math.sin(this.time * CONFIG.NEON.FLICKER_SPEED) * CONFIG.NEON.FLICKER_AMOUNT + Math.random() * 0.015;
            this.material.emissiveIntensity = this.config.emissiveIntensity * flicker;
        }
    }

    reveal() {
        this.isRevealed = true;
        this.letterMeshes.forEach((letterGroup) => {
            letterGroup.userData.targetScale = 1;
        });
    }

    hide() {
        this.isRevealed = false;
        this.letterMeshes.forEach((letterGroup) => {
            letterGroup.userData.targetScale = 0;
        });
    }

    setArchConfig(config) {
        Object.assign(this.config, config);
        if (this.pendingText) {
            this.generateText(this.pendingText);
        }
    }

    clear() {
        this.letterMeshes.forEach((letterGroup) => {
            letterGroup.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
            });
            this.mesh.remove(letterGroup);
        });
        this.letterMeshes = [];
    }

    dispose() {
        this.clear();
        this.material.dispose();
        this.scene.remove(this.mesh);
    }
}

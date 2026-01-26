import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { CONFIG } from '../utils/Constants.js';

export class ArchText {
    constructor(scene, text = '', config = {}) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.font = null;
        this.letterMeshes = [];
        this.time = 0;
        this.pendingText = text;
        this.isRevealed = false; // Track reveal state

        this.config = {
            // Arch configuration
            archRadius: config.archRadius || 3,
            archStartAngle: config.archStartAngle || Math.PI * 0.7, // Start angle in radians
            archEndAngle: config.archEndAngle || Math.PI * 0.3, // End angle in radians
            archCenter: config.archCenter || { x: 0, y: 0, z: 0 },

            // Letter configuration
            letterSize: config.letterSize || 0.4,
            tubeRadius: config.tubeRadius || 0.03,
            curveResolution: config.curveResolution || 30, // Higher = smoother letters
            tubeSegments: config.tubeSegments || 8, // Radial segments around tube

            // Animation
            floatAmount: config.floatAmount || 0.05,
            floatSpeed: config.floatSpeed || 1.5,
            wobbleAmount: config.wobbleAmount || 0.03,
            wobbleSpeed: config.wobbleSpeed || 2.0,

            letterSpacing: config.letterSpacing ?? 1.0, // <1 = tighter, >1 = wider
            flickerEnabled: config.flickerEnabled ?? true, // Disable on mobile for performance

            // Neon
            neonColor: config.neonColor || '#ff6b9d',
            emissiveIntensity: config.emissiveIntensity || 2.0,

            // Position offset
            position: config.position || { x: 0, y: 0, z: 0 }
        };

        // Neon color
        this.neonColor = new THREE.Color(this.config.neonColor);

        // Neon material
        this.material = new THREE.MeshStandardMaterial({
            color: this.neonColor,
            emissive: this.neonColor,
            emissiveIntensity: this.config.emissiveIntensity,
            metalness: 0.3,
            roughness: 0.4
        });

        this.totalLetters = 0;

        // Position group
        this.group.position.set(
            this.config.position.x,
            this.config.position.y,
            this.config.position.z
        );

        this.loadFont();
        scene.add(this.group);
    }

    loadFont() {
        const loader = new FontLoader();
        loader.load(
            '/fonts/Roboto_Regular.typeface.json',
            (font) => {
                this.font = font;
                if (this.pendingText) this.generateText(this.pendingText);
            },
            undefined,
            (error) => {
                console.error('ArchText font loading failed:', error);
            }
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
            const a = char === ' ' ? 1.0 : 1.0;
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

            const letterGroup = this.createLetter(char, letterSize, tubeRadius);
            if (!letterGroup) continue;

            letterGroup.position.set(x, y, 0);
            letterGroup.rotation.z = angle - Math.PI / 2;

            letterGroup.userData = {
                baseX: x,
                baseY: y,
                baseRotation: angle - Math.PI / 2,
                phaseOffset: i * 0.4 + Math.random() * 0.3,
                targetScale: this.isRevealed ? 1 : 0, // Start hidden unless already revealed
                currentScale: 0
            };

            letterGroup.scale.setScalar(0);
            letterGroup.visible = true;

            this.letterMeshes.push(letterGroup);
            this.group.add(letterGroup);
        }
    }

    createLetter(char, size, tubeRadius) {
        const shapes = this.font.generateShapes(char, size);
        const letterGroup = new THREE.Group();

        const curveResolution = this.config.curveResolution;

        shapes.forEach((shape) => {
            const shapePoints = shape.getPoints(curveResolution);
            if (shapePoints.length >= 2) {
                const tubeMesh = this.createTubeFromPoints(shapePoints, tubeRadius);
                if (tubeMesh) letterGroup.add(tubeMesh);
            }

            if (shape.holes) {
                shape.holes.forEach((hole) => {
                    const holePoints = hole.getPoints(curveResolution);
                    if (holePoints.length >= 2) {
                        const holeTubeMesh = this.createTubeFromPoints(holePoints, tubeRadius);
                        if (holeTubeMesh) letterGroup.add(holeTubeMesh);
                    }
                });
            }
        });

        // Center the letter geometry
        const box = new THREE.Box3().setFromObject(letterGroup);
        const center = box.getCenter(new THREE.Vector3());

        letterGroup.children.forEach((child) => {
            child.position.x -= center.x;
            child.position.y -= center.y;
        });

        return letterGroup;
    }

    createTubeFromPoints(points2D, radius) {
        if (points2D.length < 2) return null;

        const points3D = points2D.map((p) => new THREE.Vector3(p.x, p.y, 0));
        points3D.push(points3D[0].clone());

        const curve = new THREE.CatmullRomCurve3(points3D, false);

        // Tube segments along path - scale with curve resolution for consistency
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
        this.time += deltaTime;

        // Billboard - face camera
        if (camera) {
            this.group.quaternion.copy(camera.quaternion);
        }

        // Animate each letter
        this.letterMeshes.forEach((letterGroup) => {
            const data = letterGroup.userData;

            // Scale animation (pop in effect)
            const scaleDiff = data.targetScale - data.currentScale;
            data.currentScale += scaleDiff * Math.min(deltaTime * 8, 1);
            letterGroup.scale.setScalar(data.currentScale);

            if (data.currentScale > 0.1) {
                const phase = this.time * this.config.floatSpeed + data.phaseOffset;
                const wobblePhase = this.time * this.config.wobbleSpeed + data.phaseOffset * 1.3;

                // Float up/down
                const floatY = Math.sin(phase) * this.config.floatAmount;
                const floatX = Math.sin(phase * 0.7) * this.config.floatAmount * 0.5;

                // Wobble rotation
                const wobble = Math.sin(wobblePhase) * this.config.wobbleAmount;

                letterGroup.position.x = data.baseX + floatX;
                letterGroup.position.y = data.baseY + floatY;
                letterGroup.rotation.z = data.baseRotation + wobble;
            }
        });

        // Neon flicker (skip on mobile for performance)
        if (this.config.flickerEnabled) {
            const flicker = 1 + Math.sin(this.time * 25) * 0.02 + Math.random() * 0.015;
            this.material.emissiveIntensity = this.config.emissiveIntensity * flicker;
        }
    }

    // Trigger reveal animation - letters pop in
    reveal() {
        this.isRevealed = true;
        this.letterMeshes.forEach((letterGroup) => {
            letterGroup.userData.targetScale = 1;
        });
    }

    // Hide all letters
    hide() {
        this.isRevealed = false;
        this.letterMeshes.forEach((letterGroup) => {
            letterGroup.userData.targetScale = 0;
        });
    }

    setPosition(x, y, z) {
        this.group.position.set(x, y, z);
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
            this.group.remove(letterGroup);
        });
        this.letterMeshes = [];
    }

    dispose() {
        this.clear();
        this.material.dispose();
        this.scene.remove(this.group);
    }
}

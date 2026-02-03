import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { CONFIG } from '../utils/Constants.js';
import { Component } from './Component.js';

const NEON_BEHAVIOR = {
    STABLE: 'stable',
    PULSE: 'pulse',
    FLICKER: 'flicker'
};

export class CurvedText extends Component {
    constructor(scene, text = '', config = {}) {
        super({
            position: config.position || { x: 0, y: 0, z: 0 },
            behavior: config.behavior || NEON_BEHAVIOR.FLICKER,
            pulseSpeed: config.pulseSpeed || 3.0,
            alwaysOn: config.alwaysOn !== false,
            clickable: config.clickable || false,
            onClick: config.onClick || null,
            neonColor: config.neonColor || CONFIG.NEON.DEFAULT_COLOR,
            focusZ: config.focusZ ?? 2,
            ...config
        });

        this.scene = scene;
        this.mesh = new THREE.Group(); // Group acts as mesh
        this.font = null;
        this.letterMeshes = [];
        this.frame = null;
        this.background = null;
        this.hitBox = null;
        this.pendingText = text;

        // Neon colors
        this.neonColor = new THREE.Color(this.config.neonColor);
        this.offColor = this._createOffColor(this.neonColor);

        // Materials
        this.material = new THREE.MeshStandardMaterial({
            color: this.config.alwaysOn ? this.neonColor : this.offColor,
            emissive: this.config.alwaysOn ? this.neonColor : this.offColor,
            emissiveIntensity: this.config.alwaysOn ? 2.0 : 0.1,
            metalness: 0.3,
            roughness: 0.4
        });

        const bgTint = this.neonColor.clone().multiplyScalar(0.15);
        this.frameMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#5e5e5e').add(bgTint),
            metalness: 0.9,
            roughness: 0.2
        });

        this.backgroundMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#5e5e5e').add(bgTint),
            metalness: 0.1,
            roughness: 0.8,
            opacity: 0.5,
            transparent: true,
            side: THREE.DoubleSide
        });

        // Glow state
        this.isLit = this.config.alwaysOn;
        this.targetGlow = this.config.alwaysOn ? 1 : 0;
        this.currentGlow = this.config.alwaysOn ? 1 : 0;
        this.glowSpeed = 5;

        // Interaction
        this.raycaster = new THREE.Raycaster();
        this.isHovered = false;

        // Focus animation
        this.isFocused = false;
        this.originalZ = this.config.position.z;

        this.mesh.position.set(
            this.config.position.x,
            this.config.position.y,
            this.config.position.z
        );

        this._loadFont();
        scene.add(this.mesh);
    }

    _createOffColor(neonColor) {
        const hsl = {};
        neonColor.getHSL(hsl);
        return new THREE.Color().setHSL(hsl.h, hsl.s * 0.3, hsl.l * 0.15);
    }

    _loadFont() {
        const loader = new FontLoader();
        loader.load(
            CONFIG.FONT_PATHS.helvetiker,
            (font) => {
                this.font = font;
                if (this.pendingText) {
                    this.generateText(this.pendingText, this.config);
                }
                this._onLoad();
            },
            undefined,
            (error) => console.error('Font loading failed:', error)
        );
    }

    generateText(text, config = {}) {
        if (!this.font) return;

        this.clear();

        const {
            letterSize = 0.5,
            tubeRadius = 0.04,
            letterSpacing = 0.1,
            floatAmount = 0.08,
            floatSpeed = 0.5,
            framePadding = 0.15,
            frameThickness = 0.03
        } = config;

        this.floatAmount = floatAmount;
        this.floatSpeed = floatSpeed;

        let currentX = 0;
        let minY = Infinity, maxY = -Infinity;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (char === ' ') {
                currentX += letterSize * 0.5;
                continue;
            }

            const shapes = this.font.generateShapes(char, letterSize);
            const letterGroup = new THREE.Group();
            const curveResolution = 40;

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
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            letterGroup.children.forEach((child) => {
                child.position.y -= center.y;
                child.position.x -= box.min.x;
            });

            letterGroup.position.x = currentX;
            currentX += size.x + letterSpacing;

            const letterBox = new THREE.Box3().setFromObject(letterGroup);
            minY = Math.min(minY, letterBox.min.y);
            maxY = Math.max(maxY, letterBox.max.y);

            letterGroup.userData = {
                baseX: letterGroup.position.x,
                baseY: 0,
                index: i,
                phaseOffset: i * 0.3 + Math.random() * 0.2
            };

            this.letterMeshes.push(letterGroup);
            this.mesh.add(letterGroup);
        }

        // Center text
        const totalWidth = currentX - letterSpacing;
        this.letterMeshes.forEach((letterGroup) => {
            letterGroup.position.x -= totalWidth / 2;
            letterGroup.userData.baseX = letterGroup.position.x;
        });

        // Create frame and background
        const frameWidth = totalWidth + framePadding * 2;
        const frameHeight = maxY - minY + framePadding * 2;
        this._createBackground(frameWidth, frameHeight);
        this._createFrame(frameWidth, frameHeight, frameThickness);

        // Hitbox for interaction
        const hitBoxGeometry = new THREE.PlaneGeometry(frameWidth + 0.1, frameHeight + 0.1);
        const hitBoxMaterial = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
        this.hitBox = new THREE.Mesh(hitBoxGeometry, hitBoxMaterial);
        this.hitBox.position.z = 0.01;
        this.mesh.add(this.hitBox);
    }

    _createBackground(width, height) {
        const cornerRadius = 0.05;
        const shape = new THREE.Shape();

        shape.moveTo(-width / 2 + cornerRadius, -height / 2);
        shape.lineTo(width / 2 - cornerRadius, -height / 2);
        shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + cornerRadius);
        shape.lineTo(width / 2, height / 2 - cornerRadius);
        shape.quadraticCurveTo(width / 2, height / 2, width / 2 - cornerRadius, height / 2);
        shape.lineTo(-width / 2 + cornerRadius, height / 2);
        shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - cornerRadius);
        shape.lineTo(-width / 2, -height / 2 + cornerRadius);
        shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + cornerRadius, -height / 2);

        const geometry = new THREE.ShapeGeometry(shape);
        this.background = new THREE.Mesh(geometry, this.backgroundMaterial);
        this.background.position.z = -0.02;
        this.mesh.add(this.background);
    }

    _createFrame(width, height, thickness) {
        const frameGroup = new THREE.Group();
        const halfW = width / 2;
        const halfH = height / 2;
        const cornerRadius = thickness * 2;

        const framePath = new THREE.CurvePath();

        framePath.add(new THREE.LineCurve3(
            new THREE.Vector3(-halfW + cornerRadius, halfH, 0),
            new THREE.Vector3(halfW - cornerRadius, halfH, 0)
        ));
        framePath.add(new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(halfW - cornerRadius, halfH, 0),
            new THREE.Vector3(halfW, halfH, 0),
            new THREE.Vector3(halfW, halfH - cornerRadius, 0)
        ));
        framePath.add(new THREE.LineCurve3(
            new THREE.Vector3(halfW, halfH - cornerRadius, 0),
            new THREE.Vector3(halfW, -halfH + cornerRadius, 0)
        ));
        framePath.add(new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(halfW, -halfH + cornerRadius, 0),
            new THREE.Vector3(halfW, -halfH, 0),
            new THREE.Vector3(halfW - cornerRadius, -halfH, 0)
        ));
        framePath.add(new THREE.LineCurve3(
            new THREE.Vector3(halfW - cornerRadius, -halfH, 0),
            new THREE.Vector3(-halfW + cornerRadius, -halfH, 0)
        ));
        framePath.add(new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(-halfW + cornerRadius, -halfH, 0),
            new THREE.Vector3(-halfW, -halfH, 0),
            new THREE.Vector3(-halfW, -halfH + cornerRadius, 0)
        ));
        framePath.add(new THREE.LineCurve3(
            new THREE.Vector3(-halfW, -halfH + cornerRadius, 0),
            new THREE.Vector3(-halfW, halfH - cornerRadius, 0)
        ));
        framePath.add(new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(-halfW, halfH - cornerRadius, 0),
            new THREE.Vector3(-halfW, halfH, 0),
            new THREE.Vector3(-halfW + cornerRadius, halfH, 0)
        ));

        const frameGeometry = new THREE.TubeGeometry(framePath, 96, thickness, 12, true);
        const frameMesh = new THREE.Mesh(frameGeometry, this.frameMaterial);

        frameGroup.add(frameMesh);
        this.frame = frameGroup;
        this.mesh.add(frameGroup);
    }

    _createTubeFromPoints(points2D, radius) {
        if (points2D.length < 2) return null;

        const points3D = points2D.map((p) => new THREE.Vector3(p.x, p.y, 0));
        points3D.push(points3D[0].clone());

        const curve = new THREE.CatmullRomCurve3(points3D, false);
        const tubeGeometry = new THREE.TubeGeometry(
            curve,
            Math.max(points2D.length * 3, 40),
            radius,
            12,
            false
        );

        return new THREE.Mesh(tubeGeometry, this.material);
    }

    clear() {
        this.letterMeshes.forEach((letterGroup) => {
            letterGroup.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
            });
            this.mesh.remove(letterGroup);
        });
        this.letterMeshes = [];

        if (this.background) {
            this.background.geometry.dispose();
            this.mesh.remove(this.background);
            this.background = null;
        }

        if (this.frame) {
            this.frame.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
            });
            this.mesh.remove(this.frame);
            this.frame = null;
        }

        if (this.hitBox) {
            this.hitBox.geometry.dispose();
            this.mesh.remove(this.hitBox);
            this.hitBox = null;
        }
    }

    checkHover(mouseNDC, camera) {
        if (!this.hitBox) return false;
        this.raycaster.setFromCamera(mouseNDC, camera);
        const intersects = this.raycaster.intersectObject(this.hitBox);
        this.isHovered = intersects.length > 0;
        return this.isHovered;
    }

    handleClick(mouseNDC, camera) {
        if (!this.config.clickable || !this.hitBox) return false;
        this.raycaster.setFromCamera(mouseNDC, camera);
        const intersects = this.raycaster.intersectObject(this.hitBox);

        if (intersects.length > 0) {
            this.config.onClick?.(this);
            return true;
        }
        return false;
    }

    turnOn() {
        this.isLit = true;
        this.targetGlow = 1;
    }

    turnOff() {
        if (this.config.alwaysOn) return;
        this.isLit = false;
        this.targetGlow = 0;
    }

    toggle() {
        if (this.isLit && !this.config.alwaysOn) {
            this.turnOff();
        } else {
            this.turnOn();
        }
    }

    focus() { this.isFocused = true; }
    unfocus() { this.isFocused = false; }

    update(camera, deltaTime) {
        super.update(camera, deltaTime);
        if (this.letterMeshes.length === 0) return;

        // Billboard
        this.mesh.quaternion.copy(camera.quaternion);

        // Focus Z animation
        const targetZ = this.isFocused ? this.config.focusZ : this.originalZ;
        this.mesh.position.z += (targetZ - this.mesh.position.z) * 3 * deltaTime;

        // Glow animation
        this.currentGlow += (this.targetGlow - this.currentGlow) * this.glowSpeed * deltaTime;

        const glowColor = this.offColor.clone().lerp(this.neonColor, this.currentGlow);
        this.material.color.copy(glowColor);
        this.material.emissive.copy(glowColor);

        let emissiveIntensity = 0.1 + this.currentGlow * 0.9;

        if (this.isLit && this.currentGlow > 0.5) {
            switch (this.config.behavior) {
                case 'stable':
                    if (this.isHovered) emissiveIntensity *= 1.15;
                    break;
                case 'pulse':
                    const pulse = 0.85 + Math.sin(this.time * this.config.pulseSpeed * Math.PI) * 0.15;
                    emissiveIntensity *= pulse;
                    if (this.isHovered) emissiveIntensity *= 1.1;
                    break;
                case 'flicker':
                default:
                    const flicker = 1 + Math.sin(this.time * 30) * 0.02 + Math.random() * 0.02;
                    emissiveIntensity *= flicker;
                    break;
            }
        }

        this.material.emissiveIntensity = emissiveIntensity;

        // Letter floating animation
        const floatMultiplier = this.config.behavior === 'stable' ? 0.3 : 1.0;

        this.letterMeshes.forEach((letterGroup) => {
            const phase = this.time * this.floatSpeed + letterGroup.userData.phaseOffset;
            const floatY = Math.sin(phase) * this.floatAmount * floatMultiplier;
            const floatX = Math.sin(phase * 0.7) * this.floatAmount * 0.3 * floatMultiplier;

            letterGroup.position.y = letterGroup.userData.baseY + floatY;
            letterGroup.position.x = letterGroup.userData.baseX + floatX;
        });
    }

    setNeonColor(color) {
        this.neonColor.set(color);
    }

    dispose() {
        this.clear();
        this.material.dispose();
        this.frameMaterial.dispose();
        this.backgroundMaterial.dispose();
        this.scene.remove(this.mesh);
    }
}

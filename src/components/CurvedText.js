import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

// Neon behavior types
const NEON_BEHAVIOR = {
    STABLE: 'stable', // No flicker, calm glow
    PULSE: 'pulse', // Slow heartbeat pulse
    FLICKER: 'flicker' // Traditional neon flicker
};

export class CurvedText {
    constructor(scene, text = '', config = {}) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.font = null;
        this.letterMeshes = [];
        this.frame = null;
        this.time = 0;
        this.pendingText = text;
        this.config = config;

        // Neon behavior configuration
        this.behavior = config.behavior || NEON_BEHAVIOR.FLICKER;
        this.pulseSpeed = config.pulseSpeed || 3.0; // For pulse behavior
        this.alwaysOn = config.alwaysOn !== false; // Default to always on for visibility
        this.clickable = config.clickable || false;
        this.onClick = config.onClick || null;

        // Neon colors - derive off color from neon color
        this.neonColor = new THREE.Color(config.neonColor || '#ff6b9d');
        this.offColor = this.createOffColor(this.neonColor);

        // Neon material - starts based on alwaysOn setting
        this.material = new THREE.MeshStandardMaterial({
            color: this.alwaysOn ? this.neonColor : this.offColor,
            emissive: this.alwaysOn ? this.neonColor : this.offColor,
            emissiveIntensity: this.alwaysOn ? 2.0 : 0.1,
            metalness: 0.3,
            roughness: 0.4
        });

        const bgTint = this.neonColor.clone().multiplyScalar(0.15);
        // Frame material
        this.frameMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#5e5e5e').add(bgTint),
            metalness: 0.9,
            roughness: 0.2
        });

        // Background material - slightly tinted by neon color
        this.backgroundMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color('#5e5e5e').add(bgTint),
            metalness: 0.1,
            roughness: 0.8,
            opacity: 0.5,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.background = null;

        // Glow state
        this.isLit = this.alwaysOn;
        this.targetGlow = this.alwaysOn ? 1 : 0;
        this.currentGlow = this.alwaysOn ? 1 : 0;
        this.glowSpeed = 5;

        // Interaction
        this.raycaster = new THREE.Raycaster();
        this.hitBox = null;
        this.isHovered = false;

        // Position
        this.position = {
            x: config.position?.x ?? 0,
            y: config.position?.y ?? 0,
            z: config.position?.z ?? 0
        };

        // Animation state for focus/expand
        this.isFocused = false;
        this.focusZ = config.focusZ ?? 2; // Z position when focused
        this.originalZ = this.position.z;

        this.group.position.set(this.position.x, this.position.y, this.position.z);

        this.loadFont();
        scene.add(this.group);
    }

    // Create a dim "off" version of the neon color
    createOffColor(neonColor) {
        const hsl = {};
        neonColor.getHSL(hsl);
        return new THREE.Color().setHSL(hsl.h, hsl.s * 0.3, hsl.l * 0.15);
    }

    loadFont() {
        const loader = new FontLoader();
        // Helvetiker from Three.js examples - reliable, clean sans-serif
        loader.load(
            'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json',
            (font) => {
                this.font = font;
                if (this.pendingText) {
                    this.generateText(this.pendingText, this.config);
                }
            },
            undefined,
            (error) => {
                console.error('Font loading failed:', error);
            }
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
        let minY = Infinity,
            maxY = -Infinity;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (char === ' ') {
                currentX += letterSize * 0.5;
                continue;
            }

            const shapes = this.font.generateShapes(char, letterSize);
            const letterGroup = new THREE.Group();

            // Higher resolution for smoother curves
            const curveResolution = 40;

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

            const box = new THREE.Box3().setFromObject(letterGroup);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            letterGroup.children.forEach((child) => {
                child.position.y -= center.y;
                child.position.x -= box.min.x;
            });

            letterGroup.position.x = currentX;
            currentX += size.x + letterSpacing;

            // Track bounds for frame
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
            this.group.add(letterGroup);
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
        this.createBackground(frameWidth, frameHeight);
        this.createFrame(frameWidth, frameHeight, frameThickness);

        // Create invisible hitbox for interaction
        const hitBoxGeometry = new THREE.PlaneGeometry(frameWidth + 0.1, frameHeight + 0.1);
        const hitBoxMaterial = new THREE.MeshBasicMaterial({
            visible: false,
            side: THREE.DoubleSide
        });
        this.hitBox = new THREE.Mesh(hitBoxGeometry, hitBoxMaterial);
        this.hitBox.position.z = 0.01;
        this.group.add(this.hitBox);
    }

    createBackground(width, height) {
        const cornerRadius = 0.05;
        const shape = new THREE.Shape();

        // Rounded rectangle shape
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
        this.group.add(this.background);
    }

    createFrame(width, height, thickness) {
        const frameGroup = new THREE.Group();

        // Frame corners and edges using tubes
        const halfW = width / 2;
        const halfH = height / 2;
        const cornerRadius = thickness * 2;

        // Create rounded rectangle path
        const framePath = new THREE.CurvePath();

        // Top edge
        framePath.add(
            new THREE.LineCurve3(
                new THREE.Vector3(-halfW + cornerRadius, halfH, 0),
                new THREE.Vector3(halfW - cornerRadius, halfH, 0)
            )
        );

        // Top-right corner
        framePath.add(
            new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(halfW - cornerRadius, halfH, 0),
                new THREE.Vector3(halfW, halfH, 0),
                new THREE.Vector3(halfW, halfH - cornerRadius, 0)
            )
        );

        // Right edge
        framePath.add(
            new THREE.LineCurve3(
                new THREE.Vector3(halfW, halfH - cornerRadius, 0),
                new THREE.Vector3(halfW, -halfH + cornerRadius, 0)
            )
        );

        // Bottom-right corner
        framePath.add(
            new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(halfW, -halfH + cornerRadius, 0),
                new THREE.Vector3(halfW, -halfH, 0),
                new THREE.Vector3(halfW - cornerRadius, -halfH, 0)
            )
        );

        // Bottom edge
        framePath.add(
            new THREE.LineCurve3(
                new THREE.Vector3(halfW - cornerRadius, -halfH, 0),
                new THREE.Vector3(-halfW + cornerRadius, -halfH, 0)
            )
        );

        // Bottom-left corner
        framePath.add(
            new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(-halfW + cornerRadius, -halfH, 0),
                new THREE.Vector3(-halfW, -halfH, 0),
                new THREE.Vector3(-halfW, -halfH + cornerRadius, 0)
            )
        );

        // Left edge
        framePath.add(
            new THREE.LineCurve3(
                new THREE.Vector3(-halfW, -halfH + cornerRadius, 0),
                new THREE.Vector3(-halfW, halfH - cornerRadius, 0)
            )
        );

        // Top-left corner
        framePath.add(
            new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(-halfW, halfH - cornerRadius, 0),
                new THREE.Vector3(-halfW, halfH, 0),
                new THREE.Vector3(-halfW + cornerRadius, halfH, 0)
            )
        );

        const frameGeometry = new THREE.TubeGeometry(framePath, 96, thickness, 12, true);
        const frameMesh = new THREE.Mesh(frameGeometry, this.frameMaterial);

        frameGroup.add(frameMesh);
        this.frame = frameGroup;
        this.group.add(frameGroup);
    }

    createTubeFromPoints(points2D, radius) {
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

        const mesh = new THREE.Mesh(tubeGeometry, this.material);
        return mesh;
    }

    clear() {
        this.letterMeshes.forEach((letterGroup) => {
            letterGroup.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
            });
            this.group.remove(letterGroup);
        });
        this.letterMeshes = [];

        if (this.background) {
            this.background.geometry.dispose();
            this.group.remove(this.background);
            this.background = null;
        }

        if (this.frame) {
            this.frame.traverse((child) => {
                if (child.geometry) child.geometry.dispose();
            });
            this.group.remove(this.frame);
            this.frame = null;
        }

        if (this.hitBox) {
            this.hitBox.geometry.dispose();
            this.group.remove(this.hitBox);
            this.hitBox = null;
        }
    }

    // Check if mouse is hovering
    checkHover(mouseNDC, camera) {
        if (!this.hitBox) return false;

        this.raycaster.setFromCamera(mouseNDC, camera);
        const intersects = this.raycaster.intersectObject(this.hitBox);
        this.isHovered = intersects.length > 0;
        return this.isHovered;
    }

    // Check for click and trigger callback
    handleClick(mouseNDC, camera) {
        if (!this.clickable || !this.hitBox) return false;

        this.raycaster.setFromCamera(mouseNDC, camera);
        const intersects = this.raycaster.intersectObject(this.hitBox);

        if (intersects.length > 0) {
            this.onClick?.(this);
            return true;
        }
        return false;
    }

    // Turn neon on
    turnOn() {
        this.isLit = true;
        this.targetGlow = 1;
    }

    // Turn neon off
    turnOff() {
        if (this.alwaysOn) return; // Don't turn off if always on
        this.isLit = false;
        this.targetGlow = 0;
    }

    // Toggle neon
    toggle() {
        if (this.isLit && !this.alwaysOn) {
            this.turnOff();
        } else {
            this.turnOn();
        }
    }

    // Focus/expand the sign (bring forward)
    focus() {
        this.isFocused = true;
    }

    // Unfocus (return to original position)
    unfocus() {
        this.isFocused = false;
    }

    update(camera, deltaTime) {
        if (this.letterMeshes.length === 0) return;

        this.time += deltaTime;

        // Billboard - face the camera
        this.group.quaternion.copy(camera.quaternion);

        // Animate Z position for focus
        const targetZ = this.isFocused ? this.focusZ : this.originalZ;
        this.group.position.z += (targetZ - this.group.position.z) * 3 * deltaTime;

        // Animate glow
        this.currentGlow += (this.targetGlow - this.currentGlow) * this.glowSpeed * deltaTime;

        // Update material based on glow
        const glowColor = this.offColor.clone().lerp(this.neonColor, this.currentGlow);
        this.material.color.copy(glowColor);
        this.material.emissive.copy(glowColor);

        // Base emissive intensity
        let emissiveIntensity = 0.1 + this.currentGlow * 0.9;

        // Apply behavior-specific effects
        if (this.isLit && this.currentGlow > 0.5) {
            switch (this.behavior) {
                case 'stable':
                    // No flicker, just steady glow
                    // Slight hover boost
                    if (this.isHovered) {
                        emissiveIntensity *= 1.15;
                    }
                    break;

                case 'pulse':
                    // Slow heartbeat pulse
                    const pulse = 0.85 + Math.sin(this.time * this.pulseSpeed * Math.PI) * 0.15;
                    emissiveIntensity *= pulse;
                    // Hover boost
                    if (this.isHovered) {
                        emissiveIntensity *= 1.1;
                    }
                    break;

                case 'flicker':
                default:
                    // Traditional neon flicker
                    const flicker = 1 + Math.sin(this.time * 30) * 0.02 + Math.random() * 0.02;
                    emissiveIntensity *= flicker;
                    break;
            }
        }

        this.material.emissiveIntensity = emissiveIntensity;

        // Floating animation for each letter (reduced for stable behavior)
        const floatMultiplier = this.behavior === 'stable' ? 0.3 : 1.0;

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
        this.scene.remove(this.group);
    }
}

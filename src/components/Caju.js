import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGlassShader } from '../shaders/glass/glassUniforms.js';
import { createSSSShader } from '../shaders/sss/sssUniforms.js';
import { CONFIG } from '../utils/Constants.js';
import { WasmBridge } from '../wasm/WasmBridge.js';

export class Caju {
    constructor(onLoad, performanceSettings = {}) {
        this.mesh = null;
        this.onLoad = onLoad;
        this.glassUniforms = null;
        this.sssUniforms = [];
        this.performanceSettings = performanceSettings;
        this.ripplesEnabled = performanceSettings.ripplesEnabled !== false;

        this.ripples = [];
        this.maxRipples = 1;
        this.inflateRipple = null;
        this.raycaster = new THREE.Raycaster();

        this.audioContext = null; // Created lazily on first user interaction
        this.sounds = { squeakIn: null, squeakOut: null };
        this.currentSource = null;
        this.soundQueue = [];
        this.soundsLoaded = false;

        this.loadModel();
    }

    loadModel() {
        const textureLoader = new THREE.TextureLoader();
        const loadAllTextures = !this.performanceSettings.reducedTextures;

        const baseColor = textureLoader.load(CONFIG.TEXTURE_PATHS.cajuBaseColor);
        baseColor.colorSpace = THREE.SRGBColorSpace;
        baseColor.flipY = false;

        const normal = loadAllTextures
            ? this.loadTexture(textureLoader, CONFIG.TEXTURE_PATHS.cajuNormal)
            : null;
        const orm = loadAllTextures
            ? this.loadTexture(textureLoader, CONFIG.TEXTURE_PATHS.cajuORM)
            : null;

        new GLTFLoader().load(CONFIG.MODEL_PATHS.caju, (gltf) => {
            this.mesh = gltf.scene;
            this.mesh.rotation.y = Math.PI;

            this.mesh.traverse((child) => {
                if (!child.isMesh) return;

                this.ensureUV2(child);

                if (child.name === 'eye_2') {
                    this.setupGlassEye(child);
                } else {
                    this.setupBodyMaterial(child, baseColor, normal, orm);
                }
            });

            this.onLoad?.(this);
        });
    }

    ensureUV2(mesh) {
        if (!mesh.geometry.attributes.uv2 && mesh.geometry.attributes.uv) {
            mesh.geometry.setAttribute('uv2', mesh.geometry.attributes.uv);
        }
    }

    loadTexture(loader, path) {
        const tex = loader.load(path);
        tex.flipY = false;
        return tex;
    }

    setupGlassEye(mesh) {
        if (!this.ripplesEnabled) {
            mesh.visible = false;
            this.glassUniforms = { uTime: { value: 0 } };
            return;
        }

        const material = new THREE.MeshPhysicalMaterial({
            ...CONFIG.GLASS_MATERIAL,
            side: THREE.DoubleSide
        });

        material.onBeforeCompile = (shader) => {
            createGlassShader(shader);
            this.glassUniforms = shader.uniforms;
        };

        mesh.material = material;
        mesh.renderOrder = 100;
    }

    setupBodyMaterial(mesh, baseColor, normal, orm) {
        const config = {
            map: baseColor,
            metalness: mesh.name === 'plaque' ? 1.0 : 0.1,
            roughness: 1.0
        };

        if (normal) config.normalMap = normal;
        if (orm) {
            config.aoMap = orm;
            config.aoMapIntensity = this.performanceSettings.aoMapIntensity || 1.0;
            config.roughnessMap = orm;
            config.metalnessMap = orm;
        }

        const useFastMaterial = this.performanceSettings.simplifiedMaterials !== false;
        let material;

        if (useFastMaterial) {
            material = new THREE.MeshStandardMaterial(config);
        } else {
            Object.assign(config, {
                thickness: 0.5,
                transmission: 0.0,
                ior: 1.4,
                sheen: 0.2,
                sheenRoughness: 0.9,
                sheenColor: new THREE.Color('#ffc4a0'),
                attenuationDistance: 0.4,
                attenuationColor: new THREE.Color('#ff9966')
            });
            material = new THREE.MeshPhysicalMaterial(config);
        }

        if (this.ripplesEnabled) {
            material.onBeforeCompile = (shader) => {
                createSSSShader(shader);
                this.sssUniforms.push(shader.uniforms);
            };
        }

        mesh.material = material;
        mesh.renderOrder = 100;
    }

    async loadSounds() {
        try {
            const [squeakIn, squeakOut] = await Promise.all([
                this.loadAudioBuffer('./assets/audio/squeaky_in.wav'),
                this.loadAudioBuffer('./assets/audio/squeaky_out.wav')
            ]);
            this.sounds.squeakIn = squeakIn;
            this.sounds.squeakOut = squeakOut;
        } catch (e) {}
    }

    async loadAudioBuffer(path) {
        const response = await fetch(path);
        const buffer = await response.arrayBuffer();
        return this.audioContext.decodeAudioData(buffer);
    }

    playSound(type, cancelQueue = false) {
        if (!this.audioContext) return; // Audio not initialized yet

        if (cancelQueue) {
            this.stopCurrentSound();
            this.soundQueue = [];
        }

        const buffer = type === 'in' ? this.sounds.squeakIn : this.sounds.squeakOut;
        if (!buffer) return;

        if (this.currentSource) {
            this.soundQueue.push(type);
            return;
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = 0.9 + Math.random() * 0.2;

        const gain = this.audioContext.createGain();
        gain.gain.value = 0.6;

        source.connect(gain);
        gain.connect(this.audioContext.destination);

        this.currentSource = source;
        source.onended = () => {
            this.currentSource = null;
            if (this.soundQueue.length > 0) {
                this.playSound(this.soundQueue.shift(), false);
            }
        };

        source.start(0);
    }

    stopCurrentSound() {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {}
            this.currentSource = null;
        }
    }

    getMesh() {
        return this.mesh;
    }

    // Get world position with offset from mesh center
    getAttachmentPoint(offset = { x: 0, y: 0.0, z: 0 }) {
        if (!this.mesh) return null;

        const worldPos = new THREE.Vector3();
        this.mesh.getWorldPosition(worldPos);

        worldPos.x += offset.x;
        worldPos.y += offset.y;
        worldPos.z += offset.z;

        return worldPos;
    }

    update(deltaTime) {
        if (!this.glassUniforms) return;

        this.glassUniforms.uTime.value += deltaTime;
        this.sssUniforms.forEach((uniforms) => {
            uniforms.uTime.value += deltaTime;
        });

        const currentTime = this.glassUniforms.uTime.value;
        this.ripples = this.ripples.filter((r) => currentTime - r.time < CONFIG.RIPPLE_LIFETIME);

        // Update inverse model matrix for shaders (computed via WASM when available)
        this.updateInverseMatrix();

        this.updateRippleUniforms(this.glassUniforms);
        this.sssUniforms.forEach((uniforms) => this.updateRippleUniforms(uniforms));
    }

    updateInverseMatrix() {
        if (!this.mesh) return;

        // Compute inverse matrix once on CPU (faster than per-vertex in shader)
        let inverseMatrix;

        if (WasmBridge.isReady()) {
            // Use WASM for faster matrix computation
            const inverseArray = WasmBridge.computeInverseMatrix(this.mesh.matrixWorld);
            if (inverseArray) {
                inverseMatrix = new THREE.Matrix4().fromArray(inverseArray);
            }
        }

        // Fallback to Three.js if WASM not available
        if (!inverseMatrix) {
            inverseMatrix = this.mesh.matrixWorld.clone().invert();
        }

        // Update all shader uniforms
        if (this.glassUniforms?.uInverseModelMatrix) {
            this.glassUniforms.uInverseModelMatrix.value.copy(inverseMatrix);
        }
        this.sssUniforms.forEach((uniforms) => {
            if (uniforms.uInverseModelMatrix) {
                uniforms.uInverseModelMatrix.value.copy(inverseMatrix);
            }
        });
    }

    updateRippleUniforms(uniforms) {
        if (!uniforms.uRipplePositions || !uniforms.uRippleTimes || !uniforms.uRippleTypes) return;

        if (!this.ripplesEnabled) {
            for (let i = 0; i < 5; i++) {
                uniforms.uRipplePositions.value[i].set(0, 0, 0);
                uniforms.uRippleTimes.value[i] = 0;
                uniforms.uRippleTypes.value[i] = -1.0;
            }
            return;
        }

        if (this.inflateRipple) {
            uniforms.uRipplePositions.value[0].copy(this.inflateRipple.position);
            uniforms.uRippleTimes.value[0] = this.inflateRipple.time;
            uniforms.uRippleTypes.value[0] = 1.0;
        } else if (this.ripples.length > 0) {
            uniforms.uRipplePositions.value[0].copy(this.ripples[0].position);
            uniforms.uRippleTimes.value[0] = this.ripples[0].time;
            uniforms.uRippleTypes.value[0] = 0.0;
        } else {
            uniforms.uRipplePositions.value[0].set(0, 0, 0);
            uniforms.uRippleTimes.value[0] = 0;
            uniforms.uRippleTypes.value[0] = -1.0;
        }

        for (let i = 1; i < 5; i++) {
            uniforms.uRipplePositions.value[i].set(0, 0, 0);
            uniforms.uRippleTimes.value[i] = 0;
            uniforms.uRippleTypes.value[i] = -1.0;
        }
    }

    unlockAudio() {
        // Create AudioContext on first user interaction (required by browsers)
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.loadSounds(); // Load sounds after context is created
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    handlePress(mouseNDC, camera) {
        if (!this.mesh) return false;

        // iOS requires resume on user gesture
        this.unlockAudio();

        // Try WASM raycasting first (faster for complex meshes)
        let hitPoint = null;

        if (WasmBridge.isReady()) {
            this.raycaster.setFromCamera(mouseNDC, camera);
            const ray = this.raycaster.ray;
            const hit = WasmBridge.raycast(
                'caju',
                ray.origin,
                ray.direction,
                this.mesh.matrixWorld
            );
            if (hit) {
                hitPoint = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z);
            }
        }

        // Fallback to Three.js raycaster
        if (!hitPoint) {
            this.raycaster.setFromCamera(mouseNDC, camera);
            const intersects = this.raycaster.intersectObject(this.mesh, true);
            if (intersects.length > 0) {
                hitPoint = intersects[0].point.clone();
            }
        }

        if (hitPoint) {
            this.ripples = [];
            const currentTime = this.glassUniforms?.uTime.value || 0;
            this.inflateRipple = {
                position: hitPoint,
                time: currentTime
            };
            this.playSound('in', true);
            return true;
        }
        return false;
    }

    updatePullPosition(mouseNDC, camera) {
        if (!this.mesh || !this.inflateRipple) return;

        this.raycaster.setFromCamera(mouseNDC, camera);
        const pullDepth = this.inflateRipple.position.distanceTo(camera.position);
        const vector = new THREE.Vector3(mouseNDC.x, mouseNDC.y, 0.5).unproject(camera);
        const dir = vector.sub(camera.position).normalize();
        this.inflateRipple.position.copy(
            camera.position.clone().add(dir.multiplyScalar(pullDepth))
        );
    }

    handleRelease() {
        if (!this.inflateRipple) return;

        const currentTime = this.glassUniforms?.uTime.value || 0;
        this.ripples = [
            {
                position: this.inflateRipple.position.clone(),
                time: currentTime
            }
        ];
        this.inflateRipple = null;
        this.playSound('out', false);
    }

    dispose() {
        this.mesh?.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry.dispose();
            ['map', 'normalMap', 'aoMap', 'metalnessMap', 'roughnessMap'].forEach((key) => {
                child.material[key]?.dispose();
            });
            child.material.dispose();
        });

        this.stopCurrentSound();
        this.soundQueue = [];
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
        }
    }
}

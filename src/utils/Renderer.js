import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CRTShader } from '../shaders/postprocessing/CRTShader.js';
import { CONFIG, isMobile } from './Constants.js';
import { WasmBridge } from '../wasm/WasmBridge.js';

export class Renderer {
    constructor(performanceSettings) {
        this.performanceSettings = performanceSettings;
        this.isMobile = isMobile();

        // Cap pixel ratio for performance
        const maxPixelRatio = this.isMobile ? 1.5 : 2;
        const devicePixelRatio = Math.min(window.devicePixelRatio, maxPixelRatio);

        this.renderer = new THREE.WebGLRenderer({
            antialias: !this.isMobile, // Disable MSAA on mobile
            alpha: false,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(devicePixelRatio);
        this.renderer.shadowMap.enabled = performanceSettings.shadowsEnabled;
        if (performanceSettings.shadowsEnabled) {
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        document.body.appendChild(this.renderer.domElement);

        this.composer = null;
        this.crtPass = null;
        this.bloomPass = null;
        this.postProcessingEnabled = performanceSettings.postProcessingEnabled;
        this.currentEffect = 'crt';
        this.bloomEnabled = true;

        // Chromatic aberration uses depth - track if enabled
        this.chromaticAberrationEnabled = true;

        this.overlayScene = new THREE.Scene();
        this.overlayObjects = [];
    }

    setupPostProcessing(scene, camera) {
        if (!this.postProcessingEnabled) return;

        this.camera = camera;
        this.scene = scene;

        const size = this.renderer.getSize(new THREE.Vector2());
        const pixelRatio = this.renderer.getPixelRatio();

        // Create optimized render target for composer
        const renderTarget = new THREE.WebGLRenderTarget(
            size.x * pixelRatio,
            size.y * pixelRatio,
            {
                type: THREE.HalfFloatType,
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                colorSpace: THREE.SRGBColorSpace
            }
        );

        this.composer = new EffectComposer(this.renderer, renderTarget);

        const renderPass = new RenderPass(scene, camera);
        this.composer.addPass(renderPass);

        // Bloom pass at reduced resolution for performance
        if (this.bloomEnabled) {
            const params = CONFIG.BLOOM_PARAMS[this.isMobile ? 'mobile' : 'desktop'];
            // Use half resolution for bloom
            const bloomResolution = new THREE.Vector2(
                Math.floor(window.innerWidth * 0.5),
                Math.floor(window.innerHeight * 0.5)
            );
            this.bloomPass = new UnrealBloomPass(
                bloomResolution,
                params.strength,
                params.radius,
                params.threshold
            );
            this.composer.addPass(this.bloomPass);
        }

        // CRT shader - depth texture only needed for chromatic aberration
        this.crtPass = new ShaderPass(CRTShader);
        this.crtPass.uniforms.uResolution.value.x = window.innerWidth;
        this.crtPass.uniforms.uResolution.value.y = window.innerHeight;
        this.crtPass.uniforms.uCameraNear.value = camera.near;
        this.crtPass.uniforms.uCameraFar.value = camera.far;
        this.applyCRTPreset(this.isMobile ? 'mobile' : 'desktop');
        this.composer.addPass(this.crtPass);

        // Create noise texture from WASM (faster than computing in shader)
        this.setupNoiseTexture();

        // Only create depth render target if chromatic aberration is enabled
        this.setupDepthTarget(size.x, size.y);
    }

    setupNoiseTexture() {
        // Try to generate noise texture via WASM, fallback to JS-generated
        const size = 256;
        let noiseData = WasmBridge.generateBlueNoiseTexture(size);

        if (!noiseData) {
            // Fallback: generate simple noise in JS
            noiseData = new Uint8Array(size * size * 4);
            for (let i = 0; i < size * size; i++) {
                const value = Math.floor(Math.random() * 256);
                noiseData[i * 4] = value;
                noiseData[i * 4 + 1] = value;
                noiseData[i * 4 + 2] = value;
                noiseData[i * 4 + 3] = 255;
            }
        }

        this.noiseTexture = new THREE.DataTexture(
            noiseData,
            size,
            size,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        );
        this.noiseTexture.wrapS = THREE.RepeatWrapping;
        this.noiseTexture.wrapT = THREE.RepeatWrapping;
        this.noiseTexture.minFilter = THREE.LinearFilter;
        this.noiseTexture.magFilter = THREE.LinearFilter;
        this.noiseTexture.needsUpdate = true;

        if (this.crtPass) {
            this.crtPass.uniforms.tNoise.value = this.noiseTexture;
        }
    }

    setupDepthTarget(width, height) {
        // Only needed for depth-based chromatic aberration
        if (!this.chromaticAberrationEnabled) {
            this.depthRenderTarget?.dispose();
            this.depthRenderTarget = null;
            return;
        }

        if (this.depthRenderTarget) {
            this.depthRenderTarget.setSize(width, height);
            return;
        }

        this.depthRenderTarget = new THREE.WebGLRenderTarget(width, height, {
            depthTexture: new THREE.DepthTexture(width, height, THREE.UnsignedShortType),
            depthBuffer: true,
            stencilBuffer: false
        });

        if (this.crtPass) {
            this.crtPass.uniforms.tDepth.value = this.depthRenderTarget.depthTexture;
        }
    }

    applyCRTPreset(preset) {
        if (!this.crtPass) return;
        const presets = {
            mobile: {
                uScanlineIntensity: 0.0, // Disable scanlines on mobile
                uChromaticAberration: 0.05,
                uGrainIntensity: 0.01,
                uGlowIntensity: 0.03,
                uColorShift: 0.03,
                uFisheyeStrength: 0.03,
                uVignetteIntensity: 0.06,
                uGridIntensity: 0.0 // Disable grid on mobile
            },
            desktop: {
                uScanlineIntensity: 0.04,
                uChromaticAberration: 0.02,
                uGrainIntensity: 0.025,
                uGlowIntensity: 0.08,
                uColorShift: 0.08,
                uFisheyeStrength: 0.08,
                uVignetteIntensity: 0.12,
                uGridIntensity: 0.08
            }
        };
        const settings = presets[preset];
        Object.entries(settings).forEach(([key, value]) => {
            this.crtPass.uniforms[key].value = value;
        });

        // Track chromatic aberration state
        this.chromaticAberrationEnabled = settings.uChromaticAberration > 0;
    }

    setEffect(effect) {
        this.currentEffect = effect;
        if (this.crtPass) {
            this.crtPass.enabled = effect === 'crt';
        }
    }

    getEffect() {
        return this.currentEffect;
    }

    disablePostProcessing() {
        if (!this.postProcessingEnabled) return;
        this.postProcessingEnabled = false;
        this.depthRenderTarget?.dispose();
        this.depthRenderTarget = null;
        this.composer?.dispose();
        this.composer = null;
        this.crtPass = null;
        this.bloomPass = null;
    }

    render(scene, camera, deltaTime) {
        if (this.composer && this.postProcessingEnabled) {
            if (this.crtPass?.enabled) {
                this.crtPass.uniforms.uTime.value += deltaTime;
            }

            // Only render depth pass if chromatic aberration is enabled
            if (this.depthRenderTarget && this.chromaticAberrationEnabled && this.scene) {
                this.renderer.setRenderTarget(this.depthRenderTarget);
                this.renderer.render(this.scene, camera);
                this.renderer.setRenderTarget(null);
            }

            this.composer.render();
        } else {
            this.renderer.render(scene, camera);
        }
    }

    onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.renderer.setSize(width, height);
        this.composer?.setSize(width, height);

        if (this.depthRenderTarget) {
            this.depthRenderTarget.setSize(width, height);
        }

        if (this.bloomPass) {
            // Keep bloom at half resolution
            this.bloomPass.resolution.set(
                Math.floor(width * 0.5),
                Math.floor(height * 0.5)
            );
        }

        if (this.crtPass) {
            this.crtPass.uniforms.uResolution.value.x = width;
            this.crtPass.uniforms.uResolution.value.y = height;
        }

        const wasMobile = this.isMobile;
        this.isMobile = isMobile();
        if (wasMobile !== this.isMobile) {
            this.applyCRTPreset(this.isMobile ? 'mobile' : 'desktop');
        }
    }

    getRenderer() {
        return this.renderer;
    }

    setBloomParams(strength, radius, threshold) {
        if (this.bloomPass) {
            this.bloomPass.strength = strength;
            this.bloomPass.radius = radius;
            this.bloomPass.threshold = threshold;
        }
    }

    enableBloom(enabled) {
        if (this.bloomPass) {
            this.bloomPass.enabled = enabled;
        }
    }

    dispose() {
        this.noiseTexture?.dispose();
        this.depthRenderTarget?.dispose();
        this.composer?.dispose();
        this.renderer.dispose();
    }
}

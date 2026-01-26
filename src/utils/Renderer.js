import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CRTShader } from '../shaders/postprocessing/CRTShader.js';
import { CONFIG, isMobile } from './Constants.js';

export class Renderer {
    constructor(performanceSettings) {
        this.performanceSettings = performanceSettings;
        this.isMobile = isMobile();

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
        });

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(performanceSettings.pixelRatio);
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
        this.bloomEnabled = !this.isMobile;

        this.overlayScene = new THREE.Scene();
        this.overlayObjects = [];
    }

    setupPostProcessing(scene, camera) {
        if (!this.postProcessingEnabled) return;

        this.camera = camera;

        // Create render target with depth texture
        const size = this.renderer.getSize(new THREE.Vector2());
        this.depthRenderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
            depthTexture: new THREE.DepthTexture(size.x, size.y),
            depthBuffer: true
        });

        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(scene, camera);
        this.composer.addPass(renderPass);

        // Bloom pass
        if (this.bloomEnabled) {
            const params = CONFIG.BLOOM_PARAMS[this.isMobile ? 'mobile' : 'desktop'];
            this.bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight),
                params.strength,
                params.radius,
                params.threshold
            );
            this.composer.addPass(this.bloomPass);
        }

        // CRT shader with depth
        this.crtPass = new ShaderPass(CRTShader);
        this.crtPass.uniforms.uResolution.value.x = window.innerWidth;
        this.crtPass.uniforms.uResolution.value.y = window.innerHeight;
        this.crtPass.uniforms.tDepth.value = this.depthRenderTarget.depthTexture;
        this.crtPass.uniforms.uCameraNear.value = camera.near;
        this.crtPass.uniforms.uCameraFar.value = camera.far;
        this.applyCRTPreset(this.isMobile ? 'mobile' : 'desktop');
        this.composer.addPass(this.crtPass);

        this.scene = scene;
    }

    applyCRTPreset(preset) {
        if (!this.crtPass) return;
        const presets = {
            mobile: {
                uScanlineIntensity: 0.02,
                uChromaticAberration: 0.005,
                uGrainIntensity: 0.015,
                uGlowIntensity: 0.05,
                uColorShift: 0.05,
                uFisheyeStrength: 0.05,
                uVignetteIntensity: 0.08,
                uGridIntensity: 0.05
            },
            desktop: {
                uScanlineIntensity: 0.05,
                uChromaticAberration: 0.025,
                uGrainIntensity: 0.03,
                uGlowIntensity: 0.1,
                uColorShift: 0.1,
                uFisheyeStrength: 0.1,
                uVignetteIntensity: 0.15,
                uGridIntensity: 0.1
            }
        };
        const settings = presets[preset];
        Object.entries(settings).forEach(([key, value]) => {
            this.crtPass.uniforms[key].value = value;
        });
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
        this.composer?.dispose();
        this.composer = null;
        this.crtPass = null;
    }

    render(scene, camera, deltaTime) {
        if (this.composer && this.postProcessingEnabled) {
            if (this.crtPass?.enabled) {
                this.crtPass.uniforms.uTime.value += deltaTime;
            }

            // Render depth pass first for depth-based effects
            if (this.depthRenderTarget && this.scene) {
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
            this.bloomPass.resolution.set(width, height);
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
        this.depthRenderTarget?.dispose();
        this.composer?.dispose();
        this.renderer.dispose();
    }
}

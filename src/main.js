import { MainScene } from './scenes/MainScene.js';
import { Camera } from './utils/Camera.js';
import { Renderer } from './utils/Renderer.js';
import { InteractionManager } from './utils/InteractionManager.js';
import { PerformanceManager } from './utils/PerformanceManager.js';
import { EventBinder } from './utils/EventBinder.js';
import { CONFIG, normalizeMouseCoords, isMobile } from './utils/Constants.js';
import { Caju } from './components/Caju.js';
import { Info } from './components/Info.js';
import { ArchText } from './components/ArchText.js';
import { FloatingPlane } from './components/FloatingPlane.js';
import { WasmBridge } from './wasm/WasmBridge.js';

class App {
    constructor() {
        this.clock = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.interactionManager = null;
        this.objects = [];
        this.cajuModel = null;
        this.isDragging = false;
        this.wasmReady = false;

        this.performanceManager = new PerformanceManager();
        this.performanceSettings = this.performanceManager.getSettings();

        this.needsRender = true;
        this.renderRequested = false;
        this.isLoading = true;
        this.loadingStartTime = null;

        this.eventBinder = new EventBinder(window, this);

        // Initialize WASM modules (non-blocking)
        this.initWasm();
        this.init();
    }

    async initWasm() {
        try {
            await WasmBridge.initialize();
            this.wasmReady = WasmBridge.isReady();
            if (this.wasmReady) {
                console.log('[App] WASM acceleration enabled');
                // Initialize raycaster if Caju is already loaded
                if (this.cajuModel?.mesh) {
                    this.initWasmRaycaster();
                }
            }
        } catch (e) {
            console.warn('[App] WASM not available, using JS fallback');
        }
    }

    initWasmRaycaster() {
        if (!this.wasmReady || !this.cajuModel?.mesh) return;

        // Extract geometry data from Caju mesh for BVH raycaster
        this.cajuModel.mesh.traverse((child) => {
            if (child.isMesh && child.geometry) {
                const positions = child.geometry.attributes.position?.array;
                const indices = child.geometry.index?.array;
                if (positions && indices) {
                    WasmBridge.createRaycaster(
                        'caju',
                        new Float32Array(positions),
                        new Uint32Array(indices)
                    );
                }
            }
        });
    }

    // Calculate visible dimensions at a given depth from camera
    getVisibleDimensions(depth) {
        const camera = this.camera.getCamera();
        const fov = camera.fov * (Math.PI / 180);
        const height = 2 * Math.tan(fov / 2) * depth;
        const width = height * camera.aspect;
        return { width, height };
    }

    // Get position in world space from normalized screen coords (-1 to 1)
    getWorldPosition(screenX, screenY, depth) {
        const { width, height } = this.getVisibleDimensions(depth);
        return {
            x: screenX * (width / 2),
            y: screenY * (height / 2),
            z: -depth
        };
    }

    init() {
        this.renderer = new Renderer(this.performanceSettings);
        this.camera = new Camera(this.renderer.getRenderer());
        this.scene = new MainScene();
        this.renderer.setupPostProcessing(this.scene.getScene(), this.camera.getCamera());

        this.createObjects();

        const infoLayout = this.calculateInfoLayout();
        new Info(
            (infoInstance) => {
                this.info = infoInstance;
                this.scene.add(infoInstance.getMesh());
                // Add the connecting string line to the scene
                if (infoInstance.getStringLine()) {
                    this.scene.add(infoInstance.getStringLine());
                }
                this.updateLayout();
                this.requestRender();
            },
            {
                position: infoLayout.position,
                scale: infoLayout.scale,
                rotationOffset: infoLayout.rotationOffset,
                floatAmount: 0.03,
                floatSpeed: 0.4,
                stringSag: 1.0
            }
        );

        // Create text and contact signs (positioned like Info with z offsets)
        this.createFloatingSigns();

        // Create arch texts with responsive settings
        this.createArchTexts();

        // Start reveal animation after a short delay
        setTimeout(() => {
            this.archTextTop?.reveal();
            setTimeout(() => this.archTextBottom?.reveal(), 400);
        }, 800);

        this.interactionManager = new InteractionManager(
            this.camera.getCamera(),
            this.objects.map((obj) => obj.getMesh())
        );

        this.setupEventListeners();
        this.setupRenderTriggers();

        this.performanceManager.startMonitoring((adjustments) => {
            if (adjustments.postProcessingEnabled === false) {
                this.renderer.disablePostProcessing();
                this.requestRender();
            }
        });

        this.clock = performance.now();
        this.loadingStartTime = performance.now();
        this.animate();
    }

    requestRender() {
        if (!this.renderRequested) {
            this.renderRequested = true;
            this.needsRender = true;
        }
    }

    setupRenderTriggers() {
        this.camera.getControls().addEventListener('change', () => this.requestRender());
    }

    createObjects() {
        new Caju((cajuInstance) => {
            this.scene.add(cajuInstance.getMesh());
            this.objects.push(cajuInstance);
            this.cajuModel = cajuInstance;
            this.interactionManager?.addObject(cajuInstance.getMesh());

            // Initialize WASM raycaster now that mesh is loaded
            if (this.wasmReady) {
                this.initWasmRaycaster();
            }

            this.requestRender();
        }, this.performanceSettings);
    }

    setupEventListeners() {
        this.eventBinder
            .bind('resize', this.onWindowResize)
            .bind('mousedown', this.onMouseDown)
            .bind('mousemove', this.onMouseMove)
            .bind('mouseup', this.onMouseUp)
            .bind('touchstart', this.onTouchStart)
            .bind('touchmove', this.onTouchMove)
            .bind('touchend', this.onTouchEnd);

        this.setupShaderMenu();
    }

    setupShaderMenu() {
        const toggle = document.getElementById('shader-toggle');
        const options = document.getElementById('shader-options');
        const buttons = options?.querySelectorAll('.shader-option');

        toggle?.addEventListener('click', () => {
            toggle.classList.toggle('open');
            options?.classList.toggle('open');
        });

        buttons?.forEach((btn) => {
            btn.addEventListener('click', () => {
                const effect = btn.dataset.effect;
                this.renderer.setEffect(effect);
                this.requestRender();

                buttons.forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');

                toggle?.classList.remove('open');
                options?.classList.remove('open');
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.shader-menu')) {
                toggle?.classList.remove('open');
                options?.classList.remove('open');
            }
        });
    }

    calculateInfoLayout() {
        const aspect = window.innerWidth / window.innerHeight;
        const isMobileLayout = isMobile();
        const isPortrait = aspect < 1;

        const depth = -3;
        const { width, height } = this.getVisibleDimensions(depth);

        let x, y, z, scale, rotationOffset;

        if (isMobileLayout || isPortrait) {
            scale = 0.7;
            x = -width * 0.0;
            y = height * 1.7;
            z = -depth * 0.7;
            rotationOffset = { x: 0.1, y: -0.4, z: -0.1 };
        } else {
            scale = 1.0;
            x = -width * 0.8;
            y = height * 1.3;
            z = -depth;
            rotationOffset = { x: 0.5, y: 0.3, z: 0.14 };
        }

        return { position: { x, y, z }, scale, rotationOffset };
    }

    createFloatingSigns() {
        const infoLayout = this.calculateInfoLayout();
        const isMobileLayout = isMobile();

        new FloatingPlane(
            CONFIG.TEXTURE_PATHS.contact,
            (plane) => {
                this.contactSign = plane;
                this.scene.add(plane.getMesh());
                this.requestRender();
            },
            {
                position: {
                    x: infoLayout.position.x,
                    y: infoLayout.position.y,
                    z: infoLayout.position.z + (isMobileLayout ? 0.1 : 0.2)
                },
                scale: infoLayout.scale * 2.8,
                aspectRatio: 1.0,
                floatAmount: 0.03,
                floatSpeed: 0.4,
                rotationLag: 0.03,
                phaseOffset: 0.5,
                renderOnTop: true
            }
        );
    }

    createArchTexts() {
        const isMobileLayout = isMobile();

        const topConfig = isMobileLayout
            ? {
                  archRadius: 1.8,
                  letterSize: 0.18,
                  tubeRadius: 0.012,
                  position: { x: 0, y: 2.3, z: -1 },
                  curveResolution: 10,
                  tubeSegments: 4
              }
            : {
                  archRadius: 3.0,
                  letterSize: 0.3,
                  tubeRadius: 0.025,
                  position: { x: 0, y: 2.3, z: -5 },
                  curveResolution: 30,
                  tubeSegments: 8
              };

        const bottomConfig = isMobileLayout
            ? {
                  archRadius: 2.5,
                  letterSize: 0.6,
                  tubeRadius: 0.012,
                  position: { x: 0, y: 0.85, z: -1 },
                  curveResolution: 20,
                  tubeSegments: 4
              }
            : {
                  archRadius: 4.0,
                  letterSize: 1.0,
                  tubeRadius: 0.02,
                  position: { x: 0, y: 0.2, z: -5 },
                  curveResolution: 30,
                  tubeSegments: 8
              };

        this.archTextTop = new ArchText(this.scene.getScene(), 'Olá, sou a', {
            ...topConfig,
            archStartAngle: Math.PI * 0.61,
            archEndAngle: Math.PI * 0.0,
            archCenter: { x: 0, y: 0, z: 0 },
            neonColor: '#c96bff',
            floatAmount: isMobileLayout ? 0.02 : 0.04,
            wobbleAmount: isMobileLayout ? 0.01 : 0.02,
            letterSpacing: 0.8,
            flickerEnabled: !isMobileLayout
        });

        this.archTextBottom = new ArchText(this.scene.getScene(), 'CAJU', {
            ...bottomConfig,
            archStartAngle: Math.PI * 0.67,
            archEndAngle: Math.PI * -0.01,
            archCenter: { x: 0, y: 0, z: 0 },
            neonColor: '#ffab4a',
            floatAmount: isMobileLayout ? 0.015 : 0.03,
            wobbleAmount: isMobileLayout ? 0.01 : 0.025,
            letterSpacing: 0.5,
            flickerEnabled: !isMobileLayout
        });
    }

    // Update all responsive elements
    updateLayout() {
        if (this.info) {
            const infoLayout = this.calculateInfoLayout();
            this.info.config.position = infoLayout.position;
            this.info.config.scale = infoLayout.scale;
            this.info.config.rotationOffset = infoLayout.rotationOffset;
            if (this.info.mesh) {
                this.info.mesh.scale.setScalar(infoLayout.scale);
            }
        }
    }

    onWindowResize() {
        this.camera.onWindowResize();
        this.renderer.onWindowResize();
        this.updateLayout();
        this.requestRender();
    }

    onMouseDown(event) {
        if (!this.cajuModel) return;
        const ndc = normalizeMouseCoords(event.clientX, event.clientY);

        this.cajuModel.unlockAudio();
        if (this.cajuModel.handlePress(ndc, this.camera.getCamera())) {
            this.isDragging = true;
            this.camera.disableControls();
            this.requestRender();
        }
    }

    onMouseMove(event) {
        if (!this.isDragging || !this.cajuModel) return;
        const ndc = normalizeMouseCoords(event.clientX, event.clientY);
        this.cajuModel.updatePullPosition(ndc, this.camera.getCamera());
        this.requestRender();
    }

    onMouseUp() {
        if (!this.cajuModel) return;
        if (this.isDragging) {
            this.camera.enableControls();
            this.isDragging = false;
        }
        this.cajuModel.handleRelease();
        this.requestRender();
    }

    onTouchStart(event) {
        if (!this.cajuModel || event.touches.length === 0) return;
        this.cajuModel.unlockAudio();
        event.preventDefault();
        const touch = event.touches[0];
        const ndc = normalizeMouseCoords(touch.clientX, touch.clientY);
        if (this.cajuModel.handlePress(ndc, this.camera.getCamera())) {
            this.isDragging = true;
            this.camera.disableControls();
            this.requestRender();
        }
    }

    onTouchMove(event) {
        if (!this.isDragging || !this.cajuModel || event.touches.length === 0) return;
        event.preventDefault();
        const touch = event.touches[0];
        const ndc = normalizeMouseCoords(touch.clientX, touch.clientY);
        this.cajuModel.updatePullPosition(ndc, this.camera.getCamera());
        this.requestRender();
    }

    onTouchEnd(event) {
        if (!this.cajuModel) return;
        event.preventDefault();
        if (this.isDragging) {
            this.camera.enableControls();
            this.isDragging = false;
        }
        this.cajuModel.handleRelease();
        this.requestRender();
    }

    update(deltaTime) {
        this.performanceManager.update(deltaTime);
        this.camera.update();

        if (this.info && this.cajuModel) {
            const attachPoint = this.cajuModel.getAttachmentPoint({ x: -0.0, y: -1.7, z: 0.3 });
            if (attachPoint) {
                this.info.update(this.camera.getCamera(), deltaTime, attachPoint);
            }
        }

        // Update arch texts
        this.archTextTop?.update(this.camera.getCamera(), deltaTime);
        this.archTextBottom?.update(this.camera.getCamera(), deltaTime);

        // Update floating signs
        this.contactSign?.update(this.camera.getCamera(), deltaTime);

        this.objects.forEach((obj) => obj.update?.(deltaTime));

        // Continuous render for animations
        if (
            this.info ||
            this.archTextTop ||
            this.archTextBottom ||
            this.contactSign ||
            this.cajuModel?.inflateRipple ||
            this.cajuModel?.ripples.length > 0
        ) {
            this.requestRender();
        }
    }

    render(deltaTime) {
        this.renderer.render(this.scene.getScene(), this.camera.getCamera(), deltaTime);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        const now = performance.now();
        const deltaTime = (now - this.clock) * 0.001;
        this.clock = now;

        this.update(deltaTime);

        // Render continuously while assets load
        if (this.isLoading) {
            if (now - this.loadingStartTime > CONFIG.LOADING_DURATION) {
                this.isLoading = false;
                this.renderer.freezeShadowMap();
            } else {
                this.needsRender = true;
            }
        }

        if (this.needsRender) {
            this.render(deltaTime);
            this.needsRender = false;
            this.renderRequested = false;
        }
    }

    dispose() {
        this.objects.forEach((obj) => obj.dispose?.());
        this.interactionManager.dispose();
        this.eventBinder.unbindAll();
        this.renderer.dispose();

        // Clean up WASM resources
        if (this.wasmReady) {
            WasmBridge.disposeRaycaster('caju');
        }
    }
}

const app = new App();
window.app = app;

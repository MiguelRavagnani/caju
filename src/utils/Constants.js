export const CONFIG = {
    // --- Core Settings ---
    MOBILE_BREAKPOINT: 768,
    BLOOM_LAYER: 1,
    FPS_THRESHOLD: 50,
    LOADING_DURATION: 3000,

    // --- Ripple System ---
    RIPPLE: {
        MAX_COUNT: 5,           // Shader expects 5 slots
        LIFETIME: 1.5,          // Seconds before ripple fades
        AMPLITUDE: 0.5,         // Default wave height
        SPEED: 5.0,             // Propagation speed
        DECAY: 0.95,            // Amplitude decay per frame
        STRENGTH: 0.08          // Vertex displacement strength
    },

    // Keep legacy for backward compat
    RIPPLE_LIFETIME: 1.5,
    MAX_RIPPLES: 1,

    // --- Animation Defaults ---
    ANIMATION: {
        FLOAT_AMOUNT: 0.05,
        FLOAT_AMOUNT_SMALL: 0.03,
        FLOAT_SPEED: 0.5,
        ROTATION_LAG: 0.03,
        WOBBLE_AMOUNT: 0.03,
        WOBBLE_SPEED: 2.0
    },

    // --- Neon Text ---
    NEON: {
        DEFAULT_COLOR: '#ff6b9d',
        ARCH_TOP_COLOR: '#c96bff',
        ARCH_BOTTOM_COLOR: '#ffab4a',
        EMISSIVE_INTENSITY: 2.0,
        FLICKER_SPEED: 25,
        FLICKER_AMOUNT: 0.02
    },

    // --- Layout Multipliers ---
    LAYOUT: {
        MOBILE_SCALE: 0.7,
        DESKTOP_SCALE: 1.0,
        INFO_MOBILE_Y: 1.7,
        INFO_DESKTOP_Y: 1.3,
        INFO_DESKTOP_X: -0.8
    },

    // --- Scene Lighting ---
    LIGHTING: {
        BACKGROUND_COLOR: '#7a668a',
        DIRECTIONAL_COLOR: '#fffdf2',
        DIRECTIONAL_INTENSITY: 2.0,
        FILL_COLOR: '#197dff',
        FILL_INTENSITY: 3.3
    },

    // --- CRT Shader ---
    CRT: {
        SCANLINE_INTENSITY: 0.05,
        GRAIN_INTENSITY: 0.03,
        FISHEYE_STRENGTH: 0.1,
        COLOR_SHIFT: 0.05
    },

    // --- Asset Paths ---
    TEXTURE_PATHS: {
        cajuBaseColor: './assets/textures/caju_low_Material_BaseColor.jpg',
        cajuNormal: './assets/textures/caju_low_Material_Normal.jpg',
        cajuORM: './assets/textures/caju_low_Material_OcclusionRoughnessMetallic.jpg',
        infoBaseColor: './assets/textures/info_low_DefaultMaterial_BaseColor.png',
        infoNormal: './assets/textures/info_low_DefaultMaterial_Normal.png',
        infoORM: './assets/textures/info_low_DefaultMaterial_OcclusionRoughnessMetallic.png',
        contact: './assets/textures/contact.png'
    },

    MODEL_PATHS: {
        caju: './assets/models/caju_low.glb',
        info: './assets/models/info_low.glb'
    },

    AUDIO_PATHS: {
        squeakIn: './assets/audio/squeaky_in.wav',
        squeakOut: './assets/audio/squeaky_out.wav'
    },

    FONT_PATHS: {
        roboto: '/fonts/Roboto_Regular.typeface.json',
        helvetiker: 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json'
    },

    // --- Materials ---
    GLASS_MATERIAL: {
        color: '#ffffff',
        metalness: 0.0,
        roughness: 0.0,
        transmission: 1.0,
        thickness: 0.3,
        ior: 1.1,
        transparent: true,
        opacity: 1.0
    },

    GLASS_MATERIAL_SIMPLE: {
        color: '#e8e8ff',
        metalness: 0.99,
        roughness: 0.05,
        transparent: true,
        opacity: 0.1,
        envMapIntensity: 1.5
    },

    SSS_MATERIAL: {
        translucencyColor: '#ff9966',
        thickness: 0.5,
        sheen: 0.2,
        sheenRoughness: 0.9,
        sheenColor: '#ffc4a0',
        attenuationDistance: 0.4,
        attenuationColor: '#ff9966'
    },

    // --- Post Processing ---
    BLOOM_PARAMS: {
        mobile: { strength: 0.2, radius: 0.1, threshold: 1.2 },
        desktop: { strength: 0.5, radius: 0.1, threshold: 1.1 }
    },

    // --- Arch Text Presets ---
    ARCH_TEXT: {
        TOP: {
            archStartAngle: Math.PI * 0.61,
            archEndAngle: Math.PI * 0.0,
            letterSpacing: 1.0
        },
        BOTTOM: {
            archStartAngle: Math.PI * 0.67,
            archEndAngle: Math.PI * -0.01,
            letterSpacing: 0.5
        }
    }
};

// --- Helpers ---
export const isMobile = () => window.innerWidth < CONFIG.MOBILE_BREAKPOINT;

export const normalizeMouseCoords = (x, y) => ({
    x: (x / window.innerWidth) * 2 - 1,
    y: -(y / window.innerHeight) * 2 + 1
});

/**
 * Get responsive value based on mobile/desktop
 * @param {*} mobileValue
 * @param {*} desktopValue
 */
export const responsive = (mobileValue, desktopValue) =>
    isMobile() ? mobileValue : desktopValue;

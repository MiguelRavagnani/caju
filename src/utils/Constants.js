export const CONFIG = {
    MOBILE_BREAKPOINT: 768,
    BLOOM_LAYER: 1,
    RIPPLE_LIFETIME: 1.5,
    FPS_THRESHOLD: 50,
    LOADING_DURATION: 3000,
    MAX_RIPPLES: 1,

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

    // Cheaper glass alternative - no transmission, uses env reflection instead
    GLASS_MATERIAL_SIMPLE: {
        color: '#e8e8ff',
        metalness: 0.99,
        roughness: 0.05,
        transparent: true,
        opacity: 0.1,
        envMapIntensity: 1.5
    },

    BLOOM_PARAMS: {
        mobile: { strength: 0.2, radius: 0.1, threshold: 1.2 },
        desktop: { strength: 0.5, radius: 0.1, threshold: 1.1 }
    }
};

export const isMobile = () => window.innerWidth < CONFIG.MOBILE_BREAKPOINT;

export const normalizeMouseCoords = (x, y) => ({
    x: (x / window.innerWidth) * 2 - 1,
    y: -(y / window.innerHeight) * 2 + 1
});

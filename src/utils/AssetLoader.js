import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

/**
 * Centralized asset loader with caching and batch loading
 * Singleton instance exported as default
 */
class AssetLoaderClass {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.gltfLoader = new GLTFLoader();
        this.fontLoader = new FontLoader();

        // Asset caches
        this._textures = new Map();
        this._models = new Map();
        this._fonts = new Map();
    }

    /**
     * Load a texture with caching
     * @param {string} path
     * @param {Object} options - { colorSpace, flipY }
     * @returns {Promise<THREE.Texture>}
     */
    async loadTexture(path, options = {}) {
        if (this._textures.has(path)) {
            return this._textures.get(path);
        }

        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                path,
                (texture) => {
                    texture.colorSpace = options.colorSpace ?? THREE.SRGBColorSpace;
                    texture.flipY = options.flipY ?? true;
                    this._textures.set(path, texture);
                    resolve(texture);
                },
                undefined,
                reject
            );
        });
    }

    /**
     * Load a GLTF model with caching
     * @param {string} path
     * @returns {Promise<GLTF>}
     */
    async loadModel(path) {
        if (this._models.has(path)) {
            // Return cloned scene for reuse
            const cached = this._models.get(path);
            return { ...cached, scene: cached.scene.clone() };
        }

        return new Promise((resolve, reject) => {
            this.gltfLoader.load(
                path,
                (gltf) => {
                    this._models.set(path, gltf);
                    resolve(gltf);
                },
                undefined,
                reject
            );
        });
    }

    /**
     * Load a font with caching
     * @param {string} path
     * @returns {Promise<Font>}
     */
    async loadFont(path) {
        if (this._fonts.has(path)) {
            return this._fonts.get(path);
        }

        return new Promise((resolve, reject) => {
            this.fontLoader.load(
                path,
                (font) => {
                    this._fonts.set(path, font);
                    resolve(font);
                },
                undefined,
                reject
            );
        });
    }

    /**
     * Batch load multiple assets
     * @param {Object} manifest - { textures: { name: { path, options } }, models: { name: path }, fonts: { name: path } }
     * @returns {Promise<Object>} - { textures: { name: Texture }, models: { name: GLTF }, fonts: { name: Font } }
     */
    async loadBatch(manifest) {
        const result = { textures: {}, models: {}, fonts: {} };
        const promises = [];

        // Queue texture loads
        if (manifest.textures) {
            for (const [name, config] of Object.entries(manifest.textures)) {
                const { path, ...options } = typeof config === 'string'
                    ? { path: config }
                    : config;
                promises.push(
                    this.loadTexture(path, options).then(tex => { result.textures[name] = tex; })
                );
            }
        }

        // Queue model loads
        if (manifest.models) {
            for (const [name, path] of Object.entries(manifest.models)) {
                promises.push(
                    this.loadModel(path).then(gltf => { result.models[name] = gltf; })
                );
            }
        }

        // Queue font loads
        if (manifest.fonts) {
            for (const [name, path] of Object.entries(manifest.fonts)) {
                promises.push(
                    this.loadFont(path).then(font => { result.fonts[name] = font; })
                );
            }
        }

        await Promise.all(promises);
        return result;
    }

    /**
     * Check if texture is already cached
     */
    hasTexture(path) {
        return this._textures.has(path);
    }

    /**
     * Get cached texture (sync, returns undefined if not loaded)
     */
    getTexture(path) {
        return this._textures.get(path);
    }

    /**
     * Clear all caches (for cleanup)
     */
    clearCache() {
        this._textures.forEach(tex => tex.dispose());
        this._textures.clear();
        this._models.clear();
        this._fonts.clear();
    }
}

// Export singleton instance
export const AssetLoader = new AssetLoaderClass();

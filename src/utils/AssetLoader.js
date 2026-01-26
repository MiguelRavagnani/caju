import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class AssetLoader {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.gltfLoader = new GLTFLoader();
        this.audioLoader = new THREE.AudioLoader();
        this.loadingManager = new THREE.LoadingManager();

        this.setupLoadingCallbacks();
    }

    setupLoadingCallbacks() {
        this.loadingManager.onStart = () => {};
        this.loadingManager.onLoad = () => {};
        this.loadingManager.onProgress = () => {};
        this.loadingManager.onError = () => {};
    }

    loadTexture(path) {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                path,
                (texture) => resolve(texture),
                undefined,
                (error) => reject(error)
            );
        });
    }

    loadModel(path) {
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(
                path,
                (gltf) => resolve(gltf),
                undefined,
                (error) => reject(error)
            );
        });
    }

    loadAudio(path) {
        return new Promise((resolve, reject) => {
            this.audioLoader.load(
                path,
                (buffer) => resolve(buffer),
                undefined,
                (error) => reject(error)
            );
        });
    }

    // Load multiple assets at once
    async loadAssets(assets) {
        const promises = assets.map((asset) => {
            switch (asset.type) {
                case 'texture':
                    return this.loadTexture(asset.path);
                case 'model':
                    return this.loadModel(asset.path);
                case 'audio':
                    return this.loadAudio(asset.path);
                default:
                    return Promise.reject(`Unknown asset type: ${asset.type}`);
            }
        });

        return Promise.all(promises);
    }
}

// Example usage:
//
// const assetLoader = new AssetLoader();
//
// const assets = [
//     { type: 'texture', path: '/public/assets/textures/brick.jpg' },
//     { type: 'model', path: '/public/assets/models/scene.gltf' },
//     { type: 'audio', path: '/public/assets/audio/background.mp3' }
// ];
//
// assetLoader.loadAssets(assets).then((loadedAssets) => {
//     console.log('All assets loaded!', loadedAssets);
// });

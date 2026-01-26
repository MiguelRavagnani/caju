/**
 * Performance Manager - Smart adaptive settings based on actual performance
 */
export class PerformanceManager {
    constructor() {
        this.fpsHistory = [];
        this.monitoringStarted = false;
        this.monitoringStartTime = 0;
        this.hasAdjusted = false;
        this.onSettingsChange = null;

        // Detect device info but don't make assumptions
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        const debugInfo = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
        this.isSoftwareRendering =
            renderer.toLowerCase().includes('swiftshader') ||
            renderer.toLowerCase().includes('software');
    }

    getSettings() {
        // Start with conservative but functional settings for all devices
        // Let actual FPS monitoring make adjustments if needed
        const settings = {
            pixelRatio: 1.0, // Start at 1.0 for all devices
            shadowsEnabled: false, // Shadows are expensive everywhere
            postProcessingEnabled: true, // Start with CRT enabled, disable if slow
            antialias: false, // MSAA is expensive
            ripplesEnabled: true, // Keep ripples enabled - core feature
            aoMapIntensity: 0.8,
            simplifiedMaterials: true, // Use Standard materials for better performance
            reducedTextures: false // Load all textures initially
        };

        return settings;
    }

    /**
     * Start monitoring FPS to detect slow devices
     * @param {Function} callback - Called when settings need adjustment
     */
    startMonitoring(callback) {
        this.onSettingsChange = callback;
        this.monitoringStarted = true;
        this.monitoringStartTime = performance.now();
    }

    /**
     * Update FPS monitoring with smart thresholds
     * @param {number} deltaTime - Time since last frame
     */
    update(deltaTime) {
        // Skip if already adjusted or not monitoring
        if (this.hasAdjusted || !this.monitoringStarted) {
            return;
        }

        const fps = 1.0 / deltaTime;
        this.fpsHistory.push(fps);

        // Wait longer before deciding on slower devices
        const monitoringDuration = this.isSoftwareRendering ? 5000 : 3000;
        const minSamples = this.isSoftwareRendering ? 50 : 30;

        const elapsed = performance.now() - this.monitoringStartTime;

        if (elapsed > monitoringDuration && this.fpsHistory.length > minSamples) {
            // Calculate average FPS and drop rate
            const avgFPS = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
            const dropsBelow20 = this.fpsHistory.filter((f) => f < 20).length;
            const dropRate = dropsBelow20 / this.fpsHistory.length;

            // Smart thresholds: disable post-processing if consistently slow
            if (avgFPS < 25 || dropRate > 0.3) {
                this.hasAdjusted = true;

                if (this.onSettingsChange) {
                    this.onSettingsChange({ postProcessingEnabled: false });
                }
            } else {
                this.hasAdjusted = true;
            }
        }
    }
}

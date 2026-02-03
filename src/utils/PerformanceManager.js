/**
 * Performance Manager - Smart adaptive settings based on actual performance
 *
 * Features:
 * - FPS monitoring with automatic quality adjustment
 * - Frame budget tracking for CPU-bound detection
 * - Power modes (normal, low-power) for throttled devices
 * - Update throttling for non-critical animations
 */
export class PerformanceManager {
    // Power mode constants
    static POWER_MODE = {
        NORMAL: 'normal',
        LOW_POWER: 'low-power'
    };

    constructor() {
        this.fpsHistory = [];
        this.monitoringStarted = false;
        this.monitoringStartTime = 0;
        this.hasAdjusted = false;
        this.onSettingsChange = null;

        // Frame budget tracking
        this.targetFrameTime = 16.67; // 60fps target
        this.frameBudgetExceeded = 0;
        this.frameCount = 0;
        this.lastFrameTime = 0;

        // Power mode - affects update frequencies
        this.powerMode = PerformanceManager.POWER_MODE.NORMAL;
        this.lowPowerThreshold = 25; // Switch to low-power below this FPS

        // Update throttling - tracks which systems should update this frame
        this._updateCounters = {
            string: 0,      // Info.js string curve
            archText: 0,    // ArchText letter animations
            billboards: 0,  // Billboard quaternion updates
            flicker: 0      // Neon flicker effect
        };

        // Detect device info but don't make assumptions
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        const debugInfo = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
        const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
        this.isSoftwareRendering =
            renderer.toLowerCase().includes('swiftshader') ||
            renderer.toLowerCase().includes('software');
    }

    /**
     * Check if a specific update should run this frame
     * Implements frame-skipping for non-critical updates in low-power mode
     * @param {string} system - System name ('string', 'archText', 'billboards', 'flicker')
     * @returns {boolean} - true if the system should update this frame
     */
    shouldUpdate(system) {
        if (this.powerMode === PerformanceManager.POWER_MODE.NORMAL) {
            return true;
        }

        // Low-power mode: throttle non-critical updates
        const skipRates = {
            string: 2,      // Update every 2nd frame
            archText: 3,    // Update every 3rd frame
            billboards: 2,  // Update every 2nd frame
            flicker: 4      // Update every 4th frame (or disable)
        };

        const rate = skipRates[system] || 1;
        this._updateCounters[system] = (this._updateCounters[system] || 0) + 1;

        if (this._updateCounters[system] >= rate) {
            this._updateCounters[system] = 0;
            return true;
        }
        return false;
    }

    /**
     * Get effective delta time for throttled systems
     * Returns accumulated delta time to maintain smooth animation
     * @param {string} system - System name
     * @param {number} deltaTime - Current frame delta
     * @returns {number} - Effective delta time to use
     */
    getEffectiveDelta(system, deltaTime) {
        if (this.powerMode === PerformanceManager.POWER_MODE.NORMAL) {
            return deltaTime;
        }

        const skipRates = {
            string: 2,
            archText: 3,
            billboards: 2,
            flicker: 4
        };

        const rate = skipRates[system] || 1;
        return deltaTime * rate;
    }

    /**
     * Get current power mode
     */
    getPowerMode() {
        return this.powerMode;
    }

    /**
     * Check if currently in low-power mode
     */
    isLowPowerMode() {
        return this.powerMode === PerformanceManager.POWER_MODE.LOW_POWER;
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
            simplifiedMaterials: false, // Use Standard materials for better performance
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
        const fps = 1.0 / deltaTime;
        this.frameCount++;

        // Track frame budget (continuously, even after initial adjustment)
        const frameTimeMs = deltaTime * 1000;
        if (frameTimeMs > this.targetFrameTime * 1.5) {
            this.frameBudgetExceeded++;
        }

        // Dynamic power mode switching based on recent performance
        // Check every 30 frames
        if (this.frameCount % 30 === 0) {
            const recentFps = fps;

            if (recentFps < this.lowPowerThreshold && this.powerMode === PerformanceManager.POWER_MODE.NORMAL) {
                this.powerMode = PerformanceManager.POWER_MODE.LOW_POWER;
                console.log(`[Perf] Switching to low-power mode (FPS: ${recentFps.toFixed(1)})`);
            } else if (recentFps > this.lowPowerThreshold + 10 && this.powerMode === PerformanceManager.POWER_MODE.LOW_POWER) {
                // Hysteresis: need to be well above threshold to switch back
                this.powerMode = PerformanceManager.POWER_MODE.NORMAL;
                console.log(`[Perf] Switching to normal mode (FPS: ${recentFps.toFixed(1)})`);
            }
        }

        // Skip initial adjustment logic if already adjusted or not monitoring
        if (this.hasAdjusted || !this.monitoringStarted) {
            return;
        }

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

                // Also switch to low-power mode
                this.powerMode = PerformanceManager.POWER_MODE.LOW_POWER;

                if (this.onSettingsChange) {
                    this.onSettingsChange({
                        postProcessingEnabled: false,
                        simplifiedMaterials: true,
                        pixelRatio: 0.75,
                    });
                }
            } else {
                this.hasAdjusted = true;
            }
        }
    }

    /**
     * Get performance statistics
     */
    getStats() {
        return {
            powerMode: this.powerMode,
            frameCount: this.frameCount,
            budgetExceeded: this.frameBudgetExceeded,
            exceedRate: this.frameCount > 0 ? (this.frameBudgetExceeded / this.frameCount * 100).toFixed(1) + '%' : '0%'
        };
    }
}

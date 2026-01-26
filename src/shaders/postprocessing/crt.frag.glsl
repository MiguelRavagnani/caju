uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uTime;
uniform vec2 uResolution;
uniform float uCameraNear;
uniform float uCameraFar;
uniform float uGridIntensity;
uniform float uGridSize;
uniform float uScanlineIntensity;
uniform float uScanlineCount;
uniform float uVignetteIntensity;
uniform float uChromaticAberration;
uniform float uGrainIntensity;
uniform float uGlowIntensity;
uniform float uColorShift;
uniform float uFisheyeStrength;

varying vec2 vUv;

// Convert depth buffer value to linear depth
float getLinearDepth(float depthSample) {
    float z = depthSample * 2.0 - 1.0;  // Back to NDC
    return (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear));
}

// Synthwave color palette
const vec3 synthPink = vec3(1.0, 0.2, 0.6);
const vec3 synthPurple = vec3(0.5, 0.0, 1.0);
const vec3 synthCyan = vec3(0.0, 0.8, 1.0);

// Random noise function
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// Convert linear color to sRGB
vec3 linearToSRGB(vec3 color) {
    return pow(color, vec3(1.0 / 2.2));
}

// Perspective grid effect
float perspectiveGrid(vec2 uv) {
    // Only show grid in bottom half with perspective
    float yFade = smoothstep(0.4, 1.0, uv.y);

    // Perspective distortion
    float perspective = mix(1.0, 3.0, uv.y);
    vec2 gridUv = vec2(uv.x * perspective, uv.y);

    // Create grid lines
    vec2 grid = abs(fract(gridUv * uGridSize) - 0.5);
    float gridLine = min(grid.x, grid.y);
    float gridMask = smoothstep(0.02, 0.0, gridLine);

    return gridMask * yFade * uGridIntensity;
}

// Synthwave vignette with color gradient
vec3 synthVignette(vec2 uv, vec3 color) {
    vec2 center = uv - 0.5;
    float dist = length(center);

    // Subtle darkening vignette
    float vignette = smoothstep(0.8, 0.2, dist);

    return color * vignette;
}

// Scanlines
float scanline(vec2 uv) {
    float scanline = cos(uv.y * uScanlineCount + (uTime + 2.0) * 0.5) * 0.5 + 0.5;
    return mix(1.0, scanline, uScanlineIntensity);
}

// Glow effect
vec3 addGlow(vec3 color) {
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 glow = color * luminance * uGlowIntensity;
    return color + glow;
}

// Fisheye lens distortion
vec2 fisheyeDistortion(vec2 uv, float strength) {
    // Center UV coordinates around 0.5
    vec2 centered = uv - 0.5;

    // Calculate distance from center
    float dist = length(centered);

    // Apply barrel distortion formula
    // r' = r * (1 + k * r^2)
    float distortion = 0.9 + strength * dist;

    // Apply distortion and recenter
    return centered * distortion + 0.5;
}

void main() {
    vec2 uv = vUv;

    // Apply fisheye distortion to UV coordinates
    if (uFisheyeStrength > 0.0) {
        uv = fisheyeDistortion(uv, uFisheyeStrength);
    }

    // Get base color from texture
    vec3 color = texture2D(tDiffuse, uv).rgb;

    // Chromatic aberration (only if significant)
    if (uChromaticAberration > 0.001) {
        vec2 direction = (uv - 0.5);
        float distFromCenter = length(direction);

        // Depth-based: stronger for close objects (Caju), weaker for far objects (text)
        float depthSample = texture2D(tDepth, uv).r;
        float linearDepth = getLinearDepth(depthSample);
        // Normalize depth - close objects (0-5) get high factor, far objects (5+) get low factor
        float depthFactor = 1.0 - smoothstep(1.0, 8.0, linearDepth);

        // Combine distance and depth factors
        float aberrationStrength = uChromaticAberration * (0.3 + distFromCenter * 0.8) * (0.2 + depthFactor * 1.5);

        float r = texture2D(tDiffuse, uv + direction * aberrationStrength).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, uv - direction * aberrationStrength).b;
        color = vec3(r, g, b);
    }

    // Add glow effect (only if enabled)
    if (uGlowIntensity > 0.0) {
        color = addGlow(color);
    }

    // Apply scanlines (only if enabled)
    if (uScanlineIntensity > 0.0) {
        color *= scanline(uv);
    }

    // Add perspective grid (only if enabled)
    if (uGridIntensity > 0.0) {
        float grid = perspectiveGrid(uv);
        color += synthCyan * grid * 0.5;
    }

    // Apply vignette
    color = synthVignette(uv, color);

    // Add film grain (only if enabled)
    if (uGrainIntensity > 0.0) {
        float grain = (random(uv + uTime) - 0.5) * uGrainIntensity;
        color += grain;
    }

    // Synthwave color grading (only when uColorShift > 0)
    if (uColorShift > 0.0) {
        color.r = mix(color.r, color.r * 1.05 + 0.05, uColorShift);
        color.g = mix(color.g, color.g * 0.98, uColorShift);
        color.b = mix(color.b, color.b * 1.05 + 0.08, uColorShift);
    }

    gl_FragColor = vec4(linearToSRGB(color), 1.0);
}

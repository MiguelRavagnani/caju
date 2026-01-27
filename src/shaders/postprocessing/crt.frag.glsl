uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D tNoise;
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

// Simplified linear depth
float linearDepth(float d) {
    return uCameraNear * uCameraFar / (uCameraFar - d * (uCameraFar - uCameraNear));
}

void main() {
    vec2 uv = vUv;

    // Fisheye distortion - optimized
    vec2 centered = uv - 0.5;
    float dist = dot(centered, centered); // squared distance is cheaper
    uv = centered * (0.9 + uFisheyeStrength * sqrt(dist)) + 0.5;

    // Sample base color
    vec3 color = texture2D(tDiffuse, uv).rgb;

    // Chromatic aberration - only when enabled (expensive: 2 extra texture reads)
    if (uChromaticAberration > 0.001) {
        float depthSample = texture2D(tDepth, uv).r;
        float depth = linearDepth(depthSample);
        float depthFactor = 1.0 - smoothstep(1.0, 8.0, depth);

        vec2 dir = centered;
        float strength = uChromaticAberration * (0.3 + sqrt(dist) * 0.8) * (0.2 + depthFactor * 1.5);

        color.r = texture2D(tDiffuse, uv + dir * strength).r;
        color.b = texture2D(tDiffuse, uv - dir * strength).b;
    }

    // Glow - simple luminance boost
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color += color * luma * uGlowIntensity;

    // Scanlines - simplified
    float scan = 0.5 + 0.5 * cos(uv.y * uScanlineCount + uTime * 0.5);
    color *= 1.0 - uScanlineIntensity * (1.0 - scan);

    // Grid - only bottom half
    float yFade = smoothstep(0.4, 1.0, uv.y) * uGridIntensity;
    if (yFade > 0.001) {
        float perspective = mix(1.0, 3.0, uv.y);
        vec2 gridUv = vec2(uv.x * perspective, uv.y) * uGridSize;
        vec2 grid = abs(fract(gridUv) - 0.5);
        float gridLine = smoothstep(0.02, 0.0, min(grid.x, grid.y));
        color += vec3(0.0, 0.8, 1.0) * gridLine * yFade * 0.5;
    }

    // Vignette - optimized with squared distance
    float vignette = smoothstep(0.64, 0.04, dist);
    color *= vignette;

    // Film grain - sample pre-computed noise texture (faster than sin())
    // Animate by offsetting UV with time
    vec2 noiseUv = uv * 4.0 + vec2(uTime * 0.1, uTime * 0.07);
    float grain = (texture2D(tNoise, noiseUv).r - 0.5) * uGrainIntensity;
    color += grain;

    // Color shift
    color.r = mix(color.r, color.r * 1.05 + 0.05, uColorShift);
    color.g *= mix(1.0, 0.98, uColorShift);
    color.b = mix(color.b, color.b * 1.05 + 0.08, uColorShift);

    // Output with gamma correction
    gl_FragColor = vec4(pow(color, vec3(0.4545)), 1.0);
}

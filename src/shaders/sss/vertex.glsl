// Store original position for ripple calculations
vOriginalPosition = position;

// SSS shader: Calculate world space data using original position
vec4 customWorldPos = modelMatrix * vec4(position, 1.0);

// Ripple effect - inflate on press, deflate/ripple on release
vec3 displacement = vec3(0.0);
vec3 worldNormal = normalize(normalMatrix * normal);

for (int i = 0; i < 5; i++) {
    if (uRippleTimes[i] > 0.0 && uRippleTypes[i] >= 0.0) {
        float age = uTime - uRippleTimes[i];
        vec3 toRipple = customWorldPos.xyz - uRipplePositions[i];
        float dist = length(toRipple);
        float distanceFalloff = exp(-dist * 9.5);

        if (uRippleTypes[i] > 0.5) {
            // TYPE 1: PULL - pull vertices towards click point like rubber
            // Slower, smoother rubber-like behavior

            // Object-space positions (use pre-computed inverse for performance)
            vec3 clickObj = (uInverseModelMatrix * vec4(uRipplePositions[i], 1.0)).xyz;
            vec3 vertexObj = transformed;

            // Vector from vertex → click
            vec3 toClick = clickObj - vertexObj;

            // Distance-based falloff with smoother curve
            float dist = length(toClick);
            float falloff = smoothstep(3.5, 0.0, dist); // Larger, smoother range

            // Rubber stiffness - much lower for slower, more gradual pull
            float stiffness = 0.6 * uRippleStrength;

            // FINAL rubber pull: move a fraction toward target
            displacement += toClick * falloff * stiffness;
        } else {
            // TYPE 0: DEFLATE + RIPPLE - release creates waves
            if (age < 0.8) { // Shorter duration (was 1.5)
                // Propagating wave - faster speed
                float waveSpeed = 2.0; // Faster wave (was 3.0)
                float waveFront = age * waveSpeed;

                float wave = sin(dist * 8.0 - waveFront * 10.0) *
                             exp(-dist * 2.0) *
                             exp(-age * 3.0); // Faster decay (was 1.5)

                displacement += worldNormal * wave * 0.15 * uRippleStrength;

                // Secondary ripples
                float ripple2 = sin(dist * 1.0 - waveFront * 8.0) *
                               exp(-dist * 3.0) *
                               exp(-age * 4.0) * 0.1; // Faster decay (was 2.0)
                displacement += worldNormal * ripple2 * 0.01 * uRippleStrength;
            }
        }
    }
}

// Apply displacement
transformed += displacement;
customWorldPos = modelMatrix * vec4(transformed, 1.0);

vViewDirection = normalize(cameraPosition - customWorldPos.xyz);

// Calculate thickness variation (animated)
vThickness = 0.9 + 0.3 * sin(position.y * 3.0 + uTime * 0.5);

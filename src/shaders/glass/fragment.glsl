// Glass shader: Fresnel rim lighting (only if transmission is enabled)
#ifdef USE_TRANSMISSION
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(vWorldNormal, viewDirection), 0.0), 3.0);

    // Add subtle rim lighting based on fresnel
    vec3 rimLight = vec3(0.1, 0.15, 0.2) * fresnel * 0.1;
    outgoingLight += rimLight;

    // Optional: Add time-based pulse effect
    float pulse = sin(uTime * 2.0) * 0.5 + 0.5;
    outgoingLight += vec3(0.02) * pulse * fresnel;
#endif

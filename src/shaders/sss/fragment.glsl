// SSS shader: Enhanced subsurface scattering with back-lighting
// Simulate light penetrating and scattering within the material

// Calculate back-lighting effect from fill light position
vec3 backLightDir = normalize(vec3(-5.0, 5.0, -5.0));
float backLight = max(0.0, dot(-vViewDirection, backLightDir));

// Apply thickness-based translucency
float translucency = uTranslucency * (1.0 - vThickness * 0.9);
vec3 sssColor = uTranslucencyColor * pow(backLight, 2.0) * translucency * uSSSStrength;

// Add SSS contribution to final color
outgoingLight += sssColor;

// Add subtle view-dependent sheen enhancement
float sheenFactor = pow(1.0 - max(dot(vNormal, vViewDirection), 0.0), 5.0);
outgoingLight += vec3(0.05, 0.03, 0.02) * sheenFactor * uSSSStrength * 0.3;

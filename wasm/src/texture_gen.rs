use wasm_bindgen::prelude::*;

/// Generates optimized textures for shader effects
#[wasm_bindgen]
pub struct TextureGenerator {
    seed: u32,
}

#[wasm_bindgen]
impl TextureGenerator {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Self {
        Self { seed }
    }

    /// Generate tileable noise texture (RGBA, single channel duplicated)
    /// Returns flat array: [r,g,b,a, r,g,b,a, ...]
    #[wasm_bindgen]
    pub fn generate_noise(&self, size: u32) -> Vec<u8> {
        let total = (size * size) as usize;
        let mut data = Vec::with_capacity(total * 4);

        for y in 0..size {
            for x in 0..size {
                let value = self.tileable_noise(x, y, size);
                let byte = (value * 255.0) as u8;
                data.push(byte); // R
                data.push(byte); // G
                data.push(byte); // B
                data.push(255); // A
            }
        }

        data
    }

    /// Generate blue noise texture (better for film grain - less pattern visible)
    #[wasm_bindgen]
    pub fn generate_blue_noise(&self, size: u32) -> Vec<u8> {
        let total = (size * size) as usize;
        let mut data = Vec::with_capacity(total * 4);

        // Simple blue noise approximation using multiple octaves with offset sampling
        for y in 0..size {
            for x in 0..size {
                let mut value = 0.0;
                let mut amplitude = 1.0;
                let mut total_amplitude = 0.0;

                for octave in 0..4 {
                    let freq = 1 << octave;
                    let offset = octave * 17;
                    value += self.tileable_noise(
                        (x * freq + offset) % size,
                        (y * freq + offset * 3) % size,
                        size,
                    ) * amplitude;
                    total_amplitude += amplitude;
                    amplitude *= 0.5;
                }

                value /= total_amplitude;
                let byte = (value * 255.0) as u8;
                data.push(byte);
                data.push(byte);
                data.push(byte);
                data.push(255);
            }
        }

        data
    }

    /// Generate a 3D color grading LUT as a 2D strip
    /// size: LUT resolution (e.g., 32 for 32x32x32)
    /// Returns: 2D texture of size (size*size, size)
    #[wasm_bindgen]
    pub fn generate_color_lut(&self, size: u32, contrast: f32, saturation: f32) -> Vec<u8> {
        let width = size * size;
        let height = size;
        let mut data = Vec::with_capacity((width * height * 4) as usize);

        for y in 0..height {
            for x in 0..width {
                // Convert 2D coords to 3D LUT coords
                let b = x / size;
                let r = x % size;
                let g = y;

                // Normalize to 0-1
                let mut rf = r as f32 / (size - 1) as f32;
                let mut gf = g as f32 / (size - 1) as f32;
                let mut bf = b as f32 / (size - 1) as f32;

                // Apply contrast
                rf = ((rf - 0.5) * contrast + 0.5).clamp(0.0, 1.0);
                gf = ((gf - 0.5) * contrast + 0.5).clamp(0.0, 1.0);
                bf = ((bf - 0.5) * contrast + 0.5).clamp(0.0, 1.0);

                // Apply saturation
                let luma = rf * 0.299 + gf * 0.587 + bf * 0.114;
                rf = luma + (rf - luma) * saturation;
                gf = luma + (gf - luma) * saturation;
                bf = luma + (bf - luma) * saturation;

                data.push((rf.clamp(0.0, 1.0) * 255.0) as u8);
                data.push((gf.clamp(0.0, 1.0) * 255.0) as u8);
                data.push((bf.clamp(0.0, 1.0) * 255.0) as u8);
                data.push(255);
            }
        }

        data
    }

    // Internal: tileable noise using hash
    fn tileable_noise(&self, x: u32, y: u32, size: u32) -> f32 {
        let hash = self.hash2d(x % size, y % size);
        hash as f32 / u32::MAX as f32
    }

    // Fast integer hash
    fn hash2d(&self, x: u32, y: u32) -> u32 {
        let mut h = self.seed;
        h ^= x.wrapping_mul(0x45d9f3b);
        h = h.wrapping_mul(0x45d9f3b);
        h ^= y.wrapping_mul(0x119de1f3);
        h = h.wrapping_mul(0x119de1f3);
        h ^= h >> 16;
        h
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_noise_generation() {
        let gen = TextureGenerator::new(42);
        let data = gen.generate_noise(64);
        assert_eq!(data.len(), 64 * 64 * 4);
    }

    #[test]
    fn test_lut_generation() {
        let gen = TextureGenerator::new(42);
        let data = gen.generate_color_lut(16, 1.1, 1.0);
        assert_eq!(data.len(), 16 * 16 * 16 * 4);
    }
}

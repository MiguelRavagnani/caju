use std::f32::consts::PI;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct CurveGenerator {
    // Reusable buffers to avoid allocation
    position_buffer: Vec<f32>,
    normal_buffer: Vec<f32>,
    uv_buffer: Vec<f32>,
    index_buffer: Vec<u32>,
}

#[wasm_bindgen]
impl CurveGenerator {
    #[wasm_bindgen(constructor)]
    pub fn new(max_vertices: usize) -> Self {
        Self {
            position_buffer: Vec::with_capacity(max_vertices * 3),
            normal_buffer: Vec::with_capacity(max_vertices * 3),
            uv_buffer: Vec::with_capacity(max_vertices * 2),
            index_buffer: Vec::with_capacity(max_vertices * 6),
        }
    }

    /// Generate tube geometry along an arc
    #[wasm_bindgen]
    pub fn generate_arc_tube(
        &mut self,
        radius: f32,
        tube_radius: f32,
        start_angle: f32,
        end_angle: f32,
        arc_segments: u32,
        tube_segments: u32,
    ) -> GeometryData {
        self.position_buffer.clear();
        self.normal_buffer.clear();
        self.uv_buffer.clear();
        self.index_buffer.clear();

        let angle_span = end_angle - start_angle;

        for i in 0..=arc_segments {
            let u = i as f32 / arc_segments as f32;
            let angle = start_angle + u * angle_span;

            // Center of tube at this point
            let cx = radius * angle.cos();
            let cy = 0.0;
            let cz = radius * angle.sin();

            // Tangent and binormal for tube orientation
            let tx = -angle.sin();
            let tz = angle.cos();

            for j in 0..=tube_segments {
                let v = j as f32 / tube_segments as f32;
                let tube_angle = v * 2.0 * PI;

                // Position on tube surface
                let nx = tube_angle.cos();
                let ny = tube_angle.sin();

                // Transform to world space
                let px = cx + tube_radius * (nx * tz);
                let py = cy + tube_radius * ny;
                let pz = cz + tube_radius * (-nx * tx);

                self.position_buffer.extend_from_slice(&[px, py, pz]);
                self.normal_buffer
                    .extend_from_slice(&[nx * tz, ny, -nx * tx]);
                self.uv_buffer.extend_from_slice(&[u, v]);
            }
        }

        // Generate indices
        for i in 0..arc_segments {
            for j in 0..tube_segments {
                let a = i * (tube_segments + 1) + j;
                let b = a + tube_segments + 1;
                let c = a + 1;
                let d = b + 1;

                self.index_buffer.extend_from_slice(&[a, b, c, b, d, c]);
            }
        }

        GeometryData {
            positions: self.position_buffer.clone(),
            normals: self.normal_buffer.clone(),
            uvs: self.uv_buffer.clone(),
            indices: self.index_buffer.clone(),
        }
    }

    /// Generate positions along a curve for text placement
    #[wasm_bindgen]
    pub fn generate_text_positions(
        &self,
        text: &str,
        radius: f32,
        start_angle: f32,
        end_angle: f32,
        letter_spacing: f32,
    ) -> Vec<f32> {
        let char_count = text.chars().count();
        let mut positions = Vec::with_capacity(char_count * 7); // x,y,z,rx,ry,rz,scale per char

        let angle_span = end_angle - start_angle;
        let step = angle_span / (char_count as f32 + (char_count as f32 - 1.0) * letter_spacing);

        for (i, _char) in text.chars().enumerate() {
            let t = i as f32 * (1.0 + letter_spacing);
            let angle = start_angle + t * step;

            let x = radius * angle.cos();
            let y = 0.0;
            let z = radius * angle.sin();

            // Rotation to face outward from center
            let ry = -angle + PI / 2.0;

            positions.extend_from_slice(&[x, y, z, 0.0, ry, 0.0, 1.0]);
        }

        positions
    }
}

#[wasm_bindgen]
pub struct GeometryData {
    positions: Vec<f32>,
    normals: Vec<f32>,
    uvs: Vec<f32>,
    indices: Vec<u32>,
}

#[wasm_bindgen]
impl GeometryData {
    #[wasm_bindgen(getter)]
    pub fn positions(&self) -> Vec<f32> {
        self.positions.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn normals(&self) -> Vec<f32> {
        self.normals.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn uvs(&self) -> Vec<f32> {
        self.uvs.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn indices(&self) -> Vec<u32> {
        self.indices.clone()
    }
}

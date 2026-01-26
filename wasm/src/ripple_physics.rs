use glam::Vec3;
use wasm_bindgen::prelude::*;

const MAX_RIPPLES: usize = 8;
const SIMULATION_SUBSTEPS: usize = 4;

#[wasm_bindgen]
pub struct RippleSimulator {
    ripples: [Ripple; MAX_RIPPLES],
    active_count: usize,
    // Vertex displacement cache
    displacements: Vec<Vec3>,
    vertex_count: usize,
}

#[derive(Clone, Copy, Default)]
struct Ripple {
    position: Vec3,
    velocity: Vec3,
    start_time: f32,
    strength: f32,
    active: bool,
    ripple_type: RippleType,
}

#[derive(Clone, Copy, Default)]
enum RippleType {
    #[default]
    Pull,
    Wave,
}

#[wasm_bindgen]
impl RippleSimulator {
    #[wasm_bindgen(constructor)]
    pub fn new(vertex_count: usize) -> Self {
        Self {
            ripples: [Ripple::default(); MAX_RIPPLES],
            active_count: 0,
            displacements: vec![Vec3::ZERO; vertex_count],
            vertex_count,
        }
    }

    /// Add a new ripple at world position
    #[wasm_bindgen]
    pub fn add_ripple(&mut self, x: f32, y: f32, z: f32, strength: f32, is_pull: bool) -> usize {
        if self.active_count >= MAX_RIPPLES {
            // Find oldest ripple to replace
            let mut oldest_idx = 0;
            let mut oldest_time = f32::MAX;
            for (i, r) in self.ripples.iter().enumerate() {
                if r.start_time < oldest_time {
                    oldest_time = r.start_time;
                    oldest_idx = i;
                }
            }
            self.ripples[oldest_idx] = Ripple {
                position: Vec3::new(x, y, z),
                velocity: Vec3::ZERO,
                start_time: 0.0,
                strength,
                active: true,
                ripple_type: if is_pull {
                    RippleType::Pull
                } else {
                    RippleType::Wave
                },
            };
            oldest_idx
        } else {
            let idx = self.active_count;
            self.ripples[idx] = Ripple {
                position: Vec3::new(x, y, z),
                velocity: Vec3::ZERO,
                start_time: 0.0,
                strength,
                active: true,
                ripple_type: if is_pull {
                    RippleType::Pull
                } else {
                    RippleType::Wave
                },
            };
            self.active_count += 1;
            idx
        }
    }

    /// Update ripple position (for drag interaction)
    #[wasm_bindgen]
    pub fn update_ripple_position(&mut self, index: usize, x: f32, y: f32, z: f32) {
        if index < MAX_RIPPLES && self.ripples[index].active {
            let new_pos = Vec3::new(x, y, z);
            self.ripples[index].velocity = new_pos - self.ripples[index].position;
            self.ripples[index].position = new_pos;
        }
    }

    /// Convert pull ripple to wave ripple (on release)
    #[wasm_bindgen]
    pub fn release_ripple(&mut self, index: usize) {
        if index < MAX_RIPPLES && self.ripples[index].active {
            self.ripples[index].ripple_type = RippleType::Wave;
            self.ripples[index].start_time = 0.0; // Reset wave time
        }
    }

    /// Simulate physics and compute vertex displacements
    /// Returns flat array of displacements [dx0,dy0,dz0, dx1,dy1,dz1, ...]
    #[wasm_bindgen]
    pub fn simulate(
        &mut self,
        delta_time: f32,
        vertex_positions: &[f32], // [x0,y0,z0, x1,y1,z1, ...]
        vertex_normals: &[f32],
    ) -> Vec<f32> {
        // I should probably use this
        // let substep_dt = delta_time / SIMULATION_SUBSTEPS as f32;

        // Reset displacements
        for d in &mut self.displacements {
            *d = Vec3::ZERO;
        }

        // Substep simulation for stability
        for _ in 0..SIMULATION_SUBSTEPS {
            self.simulation_step(vertex_positions, vertex_normals);
        }

        // Update ripple times
        for ripple in &mut self.ripples {
            if ripple.active {
                ripple.start_time += delta_time;

                // Deactivate old wave ripples
                if matches!(ripple.ripple_type, RippleType::Wave) && ripple.start_time > 1.5 {
                    ripple.active = false;
                }
            }
        }

        // Flatten output
        let mut output = Vec::with_capacity(self.vertex_count * 3);
        for d in &self.displacements {
            output.extend_from_slice(&[d.x, d.y, d.z]);
        }
        output
    }

    fn simulation_step(&mut self, positions: &[f32], normals: &[f32]) {
        for v_idx in 0..self.vertex_count {
            let pos_offset = v_idx * 3;
            let vertex_pos = Vec3::new(
                positions[pos_offset],
                positions[pos_offset + 1],
                positions[pos_offset + 2],
            );
            let vertex_normal = Vec3::new(
                normals[pos_offset],
                normals[pos_offset + 1],
                normals[pos_offset + 2],
            );

            let mut total_displacement = Vec3::ZERO;

            for ripple in &self.ripples {
                if !ripple.active {
                    continue;
                }

                let to_ripple = ripple.position - vertex_pos;
                let dist = to_ripple.length();

                match ripple.ripple_type {
                    RippleType::Pull => {
                        // Rubber-like pull toward ripple center
                        let falloff = (-dist * 0.5).exp();
                        let pull_strength = ripple.strength * falloff * 0.3;
                        total_displacement += to_ripple.normalize_or_zero() * pull_strength;
                    }
                    RippleType::Wave => {
                        // Propagating wave
                        let wave_speed = 5.0;
                        let wave_front = ripple.start_time * wave_speed;
                        let wave_width = 1.0;

                        let wave_dist = (dist - wave_front).abs();
                        if wave_dist < wave_width {
                            let wave_factor = (1.0 - wave_dist / wave_width)
                                * (-dist * 0.3).exp()
                                * (-ripple.start_time * 2.0).exp();

                            let wave_displacement =
                                (dist * 8.0 - wave_front * 10.0).sin() * wave_factor;

                            total_displacement +=
                                vertex_normal * wave_displacement * ripple.strength * 0.1;
                        }
                    }
                }
            }

            self.displacements[v_idx] += total_displacement;
        }
    }

    /// Get uniform data to send to shader
    #[wasm_bindgen]
    pub fn get_shader_uniforms(&self) -> Vec<f32> {
        let mut data = Vec::with_capacity(MAX_RIPPLES * 5); // pos(3) + time(1) + type(1) per ripple

        for ripple in &self.ripples {
            data.push(ripple.position.x);
            data.push(ripple.position.y);
            data.push(ripple.position.z);
            data.push(ripple.start_time);
            data.push(if ripple.active {
                match ripple.ripple_type {
                    RippleType::Pull => 1.0,
                    RippleType::Wave => 0.0,
                }
            } else {
                -1.0
            });
        }

        data
    }
}

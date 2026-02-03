use wasm_bindgen::prelude::*;

const MAX_RIPPLES: usize = 2;
const AMPLITUDE_THRESHOLD: f32 = 0.001;

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub enum RippleType {
    Wave = 0,
    Pull = 1,
}

#[derive(Clone, Copy)]
struct Ripple {
    position: [f32; 3],
    radius: f32,
    amplitude: f32,
    phase: f32,
    speed: f32,
    decay: f32,
    ripple_type: RippleType,
    active: bool,
}

#[wasm_bindgen]
pub struct RippleSimulator {
    ripples: [Ripple; MAX_RIPPLES],
}

#[wasm_bindgen]
impl RippleSimulator {
    #[wasm_bindgen(constructor)]
    pub fn new() -> RippleSimulator {
        RippleSimulator {
            ripples: [RippleSimulator::inactive_ripple(); MAX_RIPPLES],
        }
    }

    fn inactive_ripple() -> Ripple {
        Ripple {
            position: [0.0, 0.0, 0.0],
            radius: 0.0,
            amplitude: 0.0,
            phase: 0.0,
            speed: 0.0,
            decay: 1.0,
            ripple_type: RippleType::Wave,
            active: false,
        }
    }

    fn find_slot(&self) -> usize {
        self.ripples
            .iter()
            .enumerate()
            .position(|(_, r)| !r.active)
            .unwrap_or_else(|| {
                self.ripples
                    .iter()
                    .enumerate()
                    .min_by(|(_, a), (_, b)| a.phase.partial_cmp(&b.phase).unwrap())
                    .map(|(idx, _)| idx)
                    .unwrap_or(0)
            })
    }

    /// Add or replace the weakest ripple
    pub fn add_ripple(
        &mut self,
        x: f32,
        y: f32,
        z: f32,
        amplitude: f32,
        speed: f32,
        decay: f32,
        ripple_type: RippleType,
    ) {
        let idx = self.find_slot();

        self.ripples[idx] = Ripple {
            position: [x, y, z],
            radius: 0.0,
            amplitude,
            phase: 0.0,
            speed,
            decay,
            ripple_type,
            active: true,
        };
    }

    /// Advance simulation (call once per frame)
    pub fn update(&mut self, delta_time: f32) {
        for ripple in &mut self.ripples {
            if !ripple.active {
                continue;
            }

            ripple.radius += ripple.speed * delta_time;
            ripple.phase += delta_time;
            ripple.amplitude *= ripple.decay.powf(delta_time);

            if ripple.amplitude < AMPLITUDE_THRESHOLD {
                ripple.active = false;
            }
        }
    }

    /// Flat uniform buffer for Three.js
    ///
    /// Layout per ripple:
    /// [pos.x, pos.y, pos.z, radius,
    ///  amplitude, phase, type, active]
    pub fn get_uniforms(&self) -> Vec<f32> {
        self.ripples
            .iter()
            .flat_map(|r| {
                vec![
                    r.position[0],
                    r.position[1],
                    r.position[2],
                    r.radius,
                    r.amplitude,
                    r.phase,
                    r.ripple_type as i32 as f32,
                    if r.active { 1.0 } else { 0.0 },
                ]
            })
            .collect()
    }
}

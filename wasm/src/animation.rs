use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct AnimationEngine {
    // Pre-computed easing lookup tables
    ease_in_out_cubic: [f32; 256],
    ease_out_elastic: [f32; 256],
    ease_out_bounce: [f32; 256],
}

impl Default for AnimationEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl AnimationEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut engine = Self {
            ease_in_out_cubic: [0.0; 256],
            ease_out_elastic: [0.0; 256],
            ease_out_bounce: [0.0; 256],
        };
        engine.precompute_easing();
        engine
    }

    fn precompute_easing(&mut self) {
        for i in 0..256 {
            let t = i as f32 / 255.0;

            // Ease in-out cubic
            self.ease_in_out_cubic[i] = if t < 0.5 {
                4.0 * t * t * t
            } else {
                1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
            };

            // Ease out elastic
            self.ease_out_elastic[i] = if t == 0.0 {
                0.0
            } else if t == 1.0 {
                1.0
            } else {
                2.0_f32.powf(-10.0 * t)
                    * ((t * 10.0 - 0.75) * (2.0 * std::f32::consts::PI / 3.0)).sin()
                    + 1.0
            };

            // Ease out bounce
            self.ease_out_bounce[i] = Self::bounce_out(t);
        }
    }

    fn bounce_out(t: f32) -> f32 {
        const N1: f32 = 7.5625;
        const D1: f32 = 2.75;

        if t < 1.0 / D1 {
            N1 * t * t
        } else if t < 2.0 / D1 {
            let t = t - 1.5 / D1;
            N1 * t * t + 0.75
        } else if t < 2.5 / D1 {
            let t = t - 2.25 / D1;
            N1 * t * t + 0.9375
        } else {
            let t = t - 2.625 / D1;
            N1 * t * t + 0.984375
        }
    }

    /// Batch interpolate multiple values
    #[wasm_bindgen]
    pub fn batch_lerp(
        &self,
        from: &[f32],
        to: &[f32],
        progress: f32,
        easing: u8, // 0=linear, 1=cubic, 2=elastic, 3=bounce
        output: &mut [f32],
    ) {
        let t = self.apply_easing(progress, easing);

        for i in 0..from.len().min(to.len()).min(output.len()) {
            output[i] = from[i] + (to[i] - from[i]) * t;
        }
    }

    fn apply_easing(&self, t: f32, easing: u8) -> f32 {
        let index = (t.clamp(0.0, 1.0) * 255.0) as usize;

        match easing {
            0 => t, // Linear
            1 => self.ease_in_out_cubic[index],
            2 => self.ease_out_elastic[index],
            3 => self.ease_out_bounce[index],
            _ => t,
        }
    }

    /// Interpolate transformation matrices
    #[wasm_bindgen]
    #[allow(clippy::too_many_arguments)]
    pub fn interpolate_transform(
        &self,
        from_pos: &[f32],   // [x, y, z]
        from_rot: &[f32],   // [x, y, z] euler
        from_scale: &[f32], // [x, y, z]
        to_pos: &[f32],
        to_rot: &[f32],
        to_scale: &[f32],
        progress: f32,
        easing: u8,
    ) -> Vec<f32> {
        let t = self.apply_easing(progress, easing);

        let mut result = Vec::with_capacity(9);

        // Position
        for i in 0..3 {
            result.push(from_pos[i] + (to_pos[i] - from_pos[i]) * t);
        }

        // Rotation (simple euler lerp - for full quaternion, use glam)
        for i in 0..3 {
            result.push(from_rot[i] + (to_rot[i] - from_rot[i]) * t);
        }

        // Scale
        for i in 0..3 {
            result.push(from_scale[i] + (to_scale[i] - from_scale[i]) * t);
        }

        result
    }

    /// Spring physics interpolation
    #[wasm_bindgen]
    pub fn spring_interpolate(
        current: f32,
        target: f32,
        velocity: f32,
        stiffness: f32, // Spring constant (typically 100-500)
        damping: f32,   // Damping ratio (typically 10-30)
        dt: f32,
    ) -> Vec<f32> {
        // Critically damped spring
        let displacement = current - target;
        let spring_force = -stiffness * displacement;
        let damping_force = -damping * velocity;
        let acceleration = spring_force + damping_force;

        let new_velocity = velocity + acceleration * dt;
        let new_position = current + new_velocity * dt;

        vec![new_position, new_velocity]
    }
}

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct AudioProcessor {
    sample_rate: f32,
    // Reverb state
    delay_buffer: Vec<f32>,
    delay_write_pos: usize,
    // Filter state
    filter_z1: f32,
    filter_z2: f32,
}

#[wasm_bindgen]
impl AudioProcessor {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        let delay_samples = (sample_rate * 0.3) as usize; // 300ms max delay
        Self {
            sample_rate,
            delay_buffer: vec![0.0; delay_samples],
            delay_write_pos: 0,
            filter_z1: 0.0,
            filter_z2: 0.0,
        }
    }

    /// Process audio buffer with spatial effects
    /// Called from AudioWorkletProcessor
    #[wasm_bindgen]
    pub fn process(
        &mut self,
        input: &[f32],
        output: &mut [f32],
        reverb_amount: f32,
        filter_cutoff: f32,
    ) {
        let delay_time = (self.sample_rate * 0.05) as usize; // 50ms delay

        for i in 0..input.len() {
            let dry = input[i];

            // Simple comb filter reverb
            let delay_read_pos = (self.delay_write_pos + self.delay_buffer.len() - delay_time)
                % self.delay_buffer.len();
            let delayed = self.delay_buffer[delay_read_pos];

            let wet = dry + delayed * 0.6;
            self.delay_buffer[self.delay_write_pos] = wet * 0.4;
            self.delay_write_pos = (self.delay_write_pos + 1) % self.delay_buffer.len();

            // Low-pass filter
            let filtered = self.lowpass(
                dry * (1.0 - reverb_amount) + wet * reverb_amount,
                filter_cutoff,
            );

            output[i] = filtered;
        }
    }

    fn lowpass(&mut self, input: f32, cutoff: f32) -> f32 {
        // Butterworth 2nd order
        let omega = 2.0 * std::f32::consts::PI * cutoff / self.sample_rate;
        let sin_omega = omega.sin();
        let cos_omega = omega.cos();
        let alpha = sin_omega / (2.0 * 0.707); // Q = 0.707

        let b0 = (1.0 - cos_omega) / 2.0;
        let b1 = 1.0 - cos_omega;
        let b2 = (1.0 - cos_omega) / 2.0;
        let a0 = 1.0 + alpha;
        let a1 = -2.0 * cos_omega;
        let a2 = 1.0 - alpha;

        let output = (b0 / a0) * input + (b1 / a0) * self.filter_z1 + (b2 / a0) * self.filter_z2
            - (a1 / a0) * self.filter_z1
            - (a2 / a0) * self.filter_z2;

        self.filter_z2 = self.filter_z1;
        self.filter_z1 = input;

        output
    }

    /// Apply pitch shift effect
    #[wasm_bindgen]
    pub fn pitch_shift(&self, input: &[f32], output: &mut [f32], semitones: f32) {
        let ratio = 2.0_f32.powf(semitones / 12.0);
        let input_len = input.len() as f32;

        for (i, out) in output.iter_mut().enumerate() {
            let src_index = (i as f32 * ratio) % input_len;
            let index_floor = src_index.floor() as usize;
            let index_ceil = (index_floor + 1) % input.len();
            let frac = src_index.fract();

            // Linear interpolation
            *out = input[index_floor] * (1.0 - frac) + input[index_ceil] * frac;
        }
    }
}

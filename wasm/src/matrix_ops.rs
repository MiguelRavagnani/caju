use glam::Mat4;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct MatrixComputer {
    model_matrix: Mat4,
    inverse_model: Mat4,
    normal_matrix: Mat4,
}

impl Default for MatrixComputer {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl MatrixComputer {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            model_matrix: Mat4::IDENTITY,
            inverse_model: Mat4::IDENTITY,
            normal_matrix: Mat4::IDENTITY,
        }
    }

    /// Update model matrix and compute all derived matrices
    /// Uses SIMD when available (wasm32 target feature)
    #[wasm_bindgen]
    pub fn update_model(&mut self, elements: &[f32]) {
        self.model_matrix = Mat4::from_cols_array(elements.try_into().unwrap());
        self.inverse_model = self.model_matrix.inverse();
        self.normal_matrix = self.inverse_model.transpose();
    }

    /// Batch compute matrices for multiple objects
    #[wasm_bindgen]
    pub fn batch_compute(
        &self,
        model_matrices: &[f32], // N * 16 floats
        count: usize,
        output: &mut [f32], // N * 16 floats (inverses)
    ) {
        for i in 0..count {
            let offset = i * 16;
            let mat =
                Mat4::from_cols_array(model_matrices[offset..offset + 16].try_into().unwrap());
            let inverse = mat.inverse();
            output[offset..offset + 16].copy_from_slice(&inverse.to_cols_array());
        }
    }

    #[wasm_bindgen]
    pub fn get_inverse_model(&self) -> Vec<f32> {
        self.inverse_model.to_cols_array().to_vec()
    }

    #[wasm_bindgen]
    pub fn get_normal_matrix(&self) -> Vec<f32> {
        self.normal_matrix.to_cols_array().to_vec()
    }

    /// Compute MVP matrix given view and projection matrices
    #[wasm_bindgen]
    pub fn compute_mvp(&self, view_elements: &[f32], projection_elements: &[f32]) -> Vec<f32> {
        let view = Mat4::from_cols_array(view_elements.try_into().unwrap());
        let projection = Mat4::from_cols_array(projection_elements.try_into().unwrap());
        let mvp = projection * view * self.model_matrix;
        mvp.to_cols_array().to_vec()
    }
}

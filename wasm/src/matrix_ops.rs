use glam::Mat4;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct MatrixComputer {
    model_matrix: Mat4,
    inverse_model: Mat4,
    normal_matrix: Mat4,
    // Pre-allocated output buffers for zero-copy access
    inverse_buffer: [f32; 16],
    normal_buffer: [f32; 16],
    mvp_buffer: [f32; 16],
    // Shared input buffer for true zero-copy (SharedArrayBuffer)
    input_buffer: [f32; 16],
    // Additional input buffers for MVP (view, projection)
    view_buffer: [f32; 16],
    projection_buffer: [f32; 16],
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
            inverse_buffer: [0.0; 16],
            normal_buffer: [0.0; 16],
            mvp_buffer: [0.0; 16],
            input_buffer: [0.0; 16],
            view_buffer: [0.0; 16],
            projection_buffer: [0.0; 16],
        }
    }

    // --- Zero-copy pointers for direct memory access ---

    /// Get pointer to inverse matrix buffer (16 floats)
    #[wasm_bindgen]
    pub fn get_inverse_ptr(&self) -> *const f32 {
        self.inverse_buffer.as_ptr()
    }

    /// Get pointer to normal matrix buffer (16 floats)
    #[wasm_bindgen]
    pub fn get_normal_ptr(&self) -> *const f32 {
        self.normal_buffer.as_ptr()
    }

    /// Get pointer to MVP matrix buffer (16 floats)
    #[wasm_bindgen]
    pub fn get_mvp_ptr(&self) -> *const f32 {
        self.mvp_buffer.as_ptr()
    }

    /// Get pointer to shared input buffer (16 floats) - for SharedArrayBuffer
    #[wasm_bindgen]
    pub fn get_input_ptr(&mut self) -> *mut f32 {
        self.input_buffer.as_mut_ptr()
    }

    /// Get pointer to view input buffer (16 floats) - for SharedArrayBuffer MVP
    #[wasm_bindgen]
    pub fn get_view_ptr(&mut self) -> *mut f32 {
        self.view_buffer.as_mut_ptr()
    }

    /// Get pointer to projection input buffer (16 floats) - for SharedArrayBuffer MVP
    #[wasm_bindgen]
    pub fn get_projection_ptr(&mut self) -> *mut f32 {
        self.projection_buffer.as_mut_ptr()
    }

    // --- Zero-copy compute (write to internal buffers) ---

    /// Compute inverse matrix in-place (zero allocation)
    /// Result is written to internal buffer - read via get_inverse_ptr()
    #[wasm_bindgen]
    pub fn invert_inplace(&mut self, elements: &[f32]) {
        let mat = Mat4::from_cols_array(elements.try_into().unwrap());
        let inverse = mat.inverse();
        self.inverse_buffer
            .copy_from_slice(&inverse.to_cols_array());
    }

    /// Compute normal matrix in-place (zero allocation)
    /// Normal matrix = transpose(inverse(model))
    #[wasm_bindgen]
    pub fn normal_inplace(&mut self, elements: &[f32]) {
        let mat = Mat4::from_cols_array(elements.try_into().unwrap());
        let normal = mat.inverse().transpose();
        self.normal_buffer.copy_from_slice(&normal.to_cols_array());
    }

    /// Compute MVP in-place (zero allocation)
    #[wasm_bindgen]
    pub fn mvp_inplace(&mut self, model: &[f32], view: &[f32], projection: &[f32]) {
        let m = Mat4::from_cols_array(model.try_into().unwrap());
        let v = Mat4::from_cols_array(view.try_into().unwrap());
        let p = Mat4::from_cols_array(projection.try_into().unwrap());
        let mvp = p * v * m;
        self.mvp_buffer.copy_from_slice(&mvp.to_cols_array());
    }

    // --- SharedArrayBuffer (true zero-copy, reads from internal buffers) ---

    /// Compute inverse from shared input buffer (TRUE zero-copy)
    /// JS writes to input_buffer via get_input_ptr(), then calls this
    #[wasm_bindgen]
    pub fn invert_shared(&mut self) {
        let mat = Mat4::from_cols_array(&self.input_buffer);
        let inverse = mat.inverse();
        self.inverse_buffer
            .copy_from_slice(&inverse.to_cols_array());
    }

    /// Compute normal matrix from shared input buffer (TRUE zero-copy)
    #[wasm_bindgen]
    pub fn normal_shared(&mut self) {
        let mat = Mat4::from_cols_array(&self.input_buffer);
        let normal = mat.inverse().transpose();
        self.normal_buffer.copy_from_slice(&normal.to_cols_array());
    }

    /// Compute MVP from shared input buffers (TRUE zero-copy)
    /// JS writes to input_buffer, view_buffer, projection_buffer via pointers
    #[wasm_bindgen]
    pub fn mvp_shared(&mut self) {
        let m = Mat4::from_cols_array(&self.input_buffer);
        let v = Mat4::from_cols_array(&self.view_buffer);
        let p = Mat4::from_cols_array(&self.projection_buffer);
        let mvp = p * v * m;
        self.mvp_buffer.copy_from_slice(&mvp.to_cols_array());
    }

    // --- Legacy API (allocates, kept for compatibility) ---

    /// Update model matrix and compute all derived matrices
    #[wasm_bindgen]
    pub fn update_model(&mut self, elements: &[f32]) {
        self.model_matrix = Mat4::from_cols_array(elements.try_into().unwrap());
        self.inverse_model = self.model_matrix.inverse();
        self.normal_matrix = self.inverse_model.transpose();
    }

    /// Batch compute matrices for multiple objects
    #[wasm_bindgen]
    pub fn batch_compute(&self, model_matrices: &[f32], count: usize, output: &mut [f32]) {
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
}

use wasm_bindgen::prelude::*;

// Modules actively used by JS
pub mod matrix_ops;
pub mod raycast;
pub mod ripple_physics;
pub mod texture_gen;

pub use matrix_ops::MatrixComputer;
pub use raycast::BVHRaycaster;
pub use ripple_physics::RippleSimulator;
pub use texture_gen::TextureGenerator;

#[wasm_bindgen(start)]
pub fn init() {
    // WASM module initialization
}

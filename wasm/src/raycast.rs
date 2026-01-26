use glam::{Mat4, Vec3};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct BVHRaycaster {
    nodes: Vec<BVHNode>,
    triangles: Vec<Triangle>,
}

struct BVHNode {
    bounds_min: Vec3,
    bounds_max: Vec3,
    left: Option<usize>,
    right: Option<usize>,
    triangle_start: usize,
    triangle_count: usize,
}

struct Triangle {
    v0: Vec3,
    v1: Vec3,
    v2: Vec3,
    normal: Vec3,
}

#[wasm_bindgen]
impl BVHRaycaster {
    /// Build BVH from mesh geometry (call once on load)
    #[wasm_bindgen(constructor)]
    pub fn from_geometry(
        positions: &[f32], // Flat array: [x0,y0,z0, x1,y1,z1, ...]
        indices: &[u32],   // Triangle indices
    ) -> Self {
        let triangles = Self::build_triangles(positions, indices);
        let nodes = Self::build_bvh(&triangles);
        Self { nodes, triangles }
    }

    /// Fast ray-mesh intersection
    #[wasm_bindgen]
    pub fn intersect(
        &self,
        ray_origin: &[f32],    // [x, y, z]
        ray_direction: &[f32], // [x, y, z]
        model_matrix: &[f32],  // 16 floats
    ) -> Option<Vec<f32>> {
        let origin = Vec3::from_slice(ray_origin);
        let direction = Vec3::from_slice(ray_direction).normalize();
        let model = Mat4::from_cols_array(model_matrix.try_into().unwrap());
        let inverse_model = model.inverse();

        // Transform ray to object space
        let local_origin = inverse_model.transform_point3(origin);
        let local_dir = inverse_model.transform_vector3(direction).normalize();

        // BVH traversal with early termination
        self.traverse_bvh(local_origin, local_dir).map(|hit| {
            // Transform hit back to world space
            let world_point = model.transform_point3(hit.point);
            let world_normal = model.transform_vector3(hit.normal).normalize();
            vec![
                world_point.x,
                world_point.y,
                world_point.z,
                world_normal.x,
                world_normal.y,
                world_normal.z,
                hit.distance,
            ]
        })
    }

    fn traverse_bvh(&self, origin: Vec3, direction: Vec3) -> Option<RayHit> {
        // Implement iterative BVH traversal with stack
        // Much faster than recursive for WASM
        let mut stack = Vec::with_capacity(32);
        stack.push(0); // Root node

        let mut closest_hit: Option<RayHit> = None;
        let mut closest_t = f32::MAX;

        while let Some(node_idx) = stack.pop() {
            let node = &self.nodes[node_idx];

            // AABB intersection test
            if !self.ray_aabb_intersect(origin, direction, node, closest_t) {
                continue;
            }

            if node.triangle_count > 0 {
                // Leaf node - test triangles
                for i in node.triangle_start..(node.triangle_start + node.triangle_count) {
                    if let Some(hit) =
                        self.ray_triangle_intersect(origin, direction, &self.triangles[i])
                    {
                        if hit.distance < closest_t {
                            closest_t = hit.distance;
                            closest_hit = Some(hit);
                        }
                    }
                }
            } else {
                // Internal node - traverse children
                if let Some(left) = node.left {
                    stack.push(left);
                }
                if let Some(right) = node.right {
                    stack.push(right);
                }
            }
        }

        closest_hit
    }

    // Möller–Trumbore intersection algorithm
    fn ray_triangle_intersect(&self, origin: Vec3, dir: Vec3, tri: &Triangle) -> Option<RayHit> {
        const EPSILON: f32 = 0.0000001;

        let edge1 = tri.v1 - tri.v0;
        let edge2 = tri.v2 - tri.v0;
        let h = dir.cross(edge2);
        let a = edge1.dot(h);

        if a > -EPSILON && a < EPSILON {
            return None;
        }

        let f = 1.0 / a;
        let s = origin - tri.v0;
        let u = f * s.dot(h);

        if !(0.0..=1.0).contains(&u) {
            return None;
        }

        let q = s.cross(edge1);
        let v = f * dir.dot(q);

        if v < 0.0 || u + v > 1.0 {
            return None;
        }

        let t = f * edge2.dot(q);

        if t > EPSILON {
            Some(RayHit {
                point: origin + dir * t,
                normal: tri.normal,
                distance: t,
            })
        } else {
            None
        }
    }
}

struct RayHit {
    point: Vec3,
    normal: Vec3,
    distance: f32,
}

// Private implementation methods (not exposed to WASM)
impl BVHRaycaster {
    /// Build triangles from flat position and index arrays
    fn build_triangles(positions: &[f32], indices: &[u32]) -> Vec<Triangle> {
        let mut triangles = Vec::with_capacity(indices.len() / 3);

        for chunk in indices.chunks(3) {
            if chunk.len() < 3 {
                continue;
            }

            let i0 = chunk[0] as usize * 3;
            let i1 = chunk[1] as usize * 3;
            let i2 = chunk[2] as usize * 3;

            // Bounds check
            if i0 + 2 >= positions.len() || i1 + 2 >= positions.len() || i2 + 2 >= positions.len() {
                continue;
            }

            let v0 = Vec3::new(positions[i0], positions[i0 + 1], positions[i0 + 2]);
            let v1 = Vec3::new(positions[i1], positions[i1 + 1], positions[i1 + 2]);
            let v2 = Vec3::new(positions[i2], positions[i2 + 1], positions[i2 + 2]);

            // Calculate face normal
            let edge1 = v1 - v0;
            let edge2 = v2 - v0;
            let normal = edge1.cross(edge2).normalize_or_zero();

            triangles.push(Triangle { v0, v1, v2, normal });
        }

        triangles
    }

    /// Build a simple BVH (Bounding Volume Hierarchy)
    /// Uses a basic median-split approach for simplicity
    fn build_bvh(triangles: &[Triangle]) -> Vec<BVHNode> {
        if triangles.is_empty() {
            return vec![BVHNode {
                bounds_min: Vec3::ZERO,
                bounds_max: Vec3::ZERO,
                left: None,
                right: None,
                triangle_start: 0,
                triangle_count: 0,
            }];
        }

        // TODO: instead of a flat BVH with all triangles in root
        // do a recursively split (better perfromance also i guess)
        let mut bounds_min = Vec3::splat(f32::MAX);
        let mut bounds_max = Vec3::splat(f32::MIN);

        for tri in triangles {
            bounds_min = bounds_min.min(tri.v0).min(tri.v1).min(tri.v2);
            bounds_max = bounds_max.max(tri.v0).max(tri.v1).max(tri.v2);
        }

        vec![BVHNode {
            bounds_min,
            bounds_max,
            left: None,
            right: None,
            triangle_start: 0,
            triangle_count: triangles.len(),
        }]
    }

    /// Ray-AABB (Axis-Aligned Bounding Box) intersection test
    /// Returns true if ray intersects the box within max_t distance
    fn ray_aabb_intersect(
        &self,
        origin: Vec3,
        direction: Vec3,
        node: &BVHNode,
        max_t: f32,
    ) -> bool {
        // Slab method for ray-AABB intersection
        let inv_dir = Vec3::new(
            if direction.x.abs() > f32::EPSILON {
                1.0 / direction.x
            } else {
                f32::MAX
            },
            if direction.y.abs() > f32::EPSILON {
                1.0 / direction.y
            } else {
                f32::MAX
            },
            if direction.z.abs() > f32::EPSILON {
                1.0 / direction.z
            } else {
                f32::MAX
            },
        );

        let t1 = (node.bounds_min - origin) * inv_dir;
        let t2 = (node.bounds_max - origin) * inv_dir;

        let t_min_v = t1.min(t2);
        let t_max_v = t1.max(t2);

        let t_enter = t_min_v.x.max(t_min_v.y).max(t_min_v.z);
        let t_exit = t_max_v.x.min(t_max_v.y).min(t_max_v.z);

        // Ray intersects if entry point is before exit and exit is positive
        t_enter <= t_exit && t_exit >= 0.0 && t_enter < max_t
    }
}

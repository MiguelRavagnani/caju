use glam::{Mat4, Vec3};
use wasm_bindgen::prelude::*;

/// Maximum triangles per leaf node. Smaller = deeper tree, more nodes.
/// 4-8 is typical; we use 4 for better ray culling.
const MAX_LEAF_TRIANGLES: usize = 4;

#[wasm_bindgen]
pub struct BVHRaycaster {
    nodes: Vec<BVHNode>,
    triangles: Vec<Triangle>,
    /// Triangle indices, reordered during BVH build
    triangle_indices: Vec<usize>,
}

/// BVH tree node
///
/// Internal nodes: triangle_count = 0, left/right are Some
/// Leaf nodes: triangle_count > 0, left/right are None
#[derive(Clone)]
struct BVHNode {
    bounds_min: Vec3,
    bounds_max: Vec3,
    /// Index of left child node (None for leaf)
    left: Option<usize>,
    /// Index of right child node (None for leaf)
    right: Option<usize>,
    /// Start index into triangle_indices array
    triangle_start: usize,
    /// Number of triangles (0 for internal nodes)
    triangle_count: usize,
}

#[derive(Clone)]
struct Triangle {
    v0: Vec3,
    v1: Vec3,
    v2: Vec3,
    normal: Vec3,
    /// Centroid for sorting during BVH build
    centroid: Vec3,
}

struct RayHit {
    point: Vec3,
    normal: Vec3,
    distance: f32,
}

#[wasm_bindgen]
impl BVHRaycaster {
    /// Build BVH from mesh geometry (call once on load)
    ///
    /// # Arguments
    /// * `positions` - Flat vertex array: [x0,y0,z0, x1,y1,z1, ...]
    /// * `indices` - Triangle indices: [i0,i1,i2, i3,i4,i5, ...]
    #[wasm_bindgen(constructor)]
    pub fn from_geometry(positions: &[f32], indices: &[u32]) -> Self {
        let triangles = Self::build_triangles(positions, indices);
        let num_triangles = triangles.len();

        // Initial indices: 0, 1, 2, ..., n-1
        let mut triangle_indices: Vec<usize> = (0..num_triangles).collect();

        // Build BVH recursively
        let mut nodes = Vec::with_capacity(num_triangles * 2); // Approximate size

        if !triangles.is_empty() {
            Self::build_bvh_recursive(
                &triangles,
                &mut triangle_indices,
                0,
                num_triangles,
                &mut nodes,
            );
        } else {
            // Empty geometry - create dummy root
            nodes.push(BVHNode {
                bounds_min: Vec3::ZERO,
                bounds_max: Vec3::ZERO,
                left: None,
                right: None,
                triangle_start: 0,
                triangle_count: 0,
            });
        }

        Self {
            nodes,
            triangles,
            triangle_indices,
        }
    }

    /// Fast ray-mesh intersection using BVH traversal
    ///
    /// # Returns
    /// `Some([px, py, pz, nx, ny, nz, distance])` or `None`
    #[wasm_bindgen]
    pub fn intersect(
        &self,
        ray_origin: &[f32],
        ray_direction: &[f32],
        model_matrix: &[f32],
    ) -> Option<Vec<f32>> {
        let origin = Vec3::from_slice(ray_origin);
        let direction = Vec3::from_slice(ray_direction).normalize();
        let model = Mat4::from_cols_array(model_matrix.try_into().unwrap());
        let inverse_model = model.inverse();

        // Transform ray to object space
        let local_origin = inverse_model.transform_point3(origin);
        let local_dir = inverse_model.transform_vector3(direction).normalize();

        // Pre-compute inverse direction for AABB tests
        let inv_dir = Vec3::new(
            if local_dir.x.abs() > f32::EPSILON {
                1.0 / local_dir.x
            } else {
                f32::MAX
            },
            if local_dir.y.abs() > f32::EPSILON {
                1.0 / local_dir.y
            } else {
                f32::MAX
            },
            if local_dir.z.abs() > f32::EPSILON {
                1.0 / local_dir.z
            } else {
                f32::MAX
            },
        );

        // BVH traversal
        self.traverse_bvh(local_origin, local_dir, inv_dir)
            .map(|hit| {
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

    /// Get BVH statistics for debugging/benchmarking
    #[wasm_bindgen]
    pub fn get_stats(&self) -> Vec<u32> {
        let total_nodes = self.nodes.len();
        let leaf_nodes = self.nodes.iter().filter(|n| n.triangle_count > 0).count();
        let internal_nodes = total_nodes - leaf_nodes;
        let max_depth = self.compute_max_depth(0, 0);
        let total_triangles = self.triangles.len();

        vec![
            total_nodes as u32,
            leaf_nodes as u32,
            internal_nodes as u32,
            max_depth as u32,
            total_triangles as u32,
        ]
    }
}

// --- Private implementation ---

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

            // Calculate centroid for sorting
            let centroid = (v0 + v1 + v2) / 3.0;

            triangles.push(Triangle {
                v0,
                v1,
                v2,
                normal,
                centroid,
            });
        }

        triangles
    }

    /// Recursively build BVH using median-split on longest axis
    ///
    /// # Arguments
    /// * `triangles` - All triangles (immutable reference)
    /// * `indices` - Mutable triangle index array (reordered in place)
    /// * `start` - Start index in `indices` for this node
    /// * `end` - End index (exclusive) in `indices` for this node
    /// * `nodes` - Output node array
    ///
    /// # Returns
    /// Index of the created node in `nodes`
    fn build_bvh_recursive(
        triangles: &[Triangle],
        indices: &mut [usize],
        start: usize,
        end: usize,
        nodes: &mut Vec<BVHNode>,
    ) -> usize {
        let count = end - start;

        // Compute bounds for this subset
        let (bounds_min, bounds_max) = Self::compute_bounds(triangles, &indices[start..end]);

        // Create leaf node if few enough triangles
        if count <= MAX_LEAF_TRIANGLES {
            let node_idx = nodes.len();
            nodes.push(BVHNode {
                bounds_min,
                bounds_max,
                left: None,
                right: None,
                triangle_start: start,
                triangle_count: count,
            });
            return node_idx;
        }

        // Find longest axis
        let extent = bounds_max - bounds_min;
        let axis = if extent.x >= extent.y && extent.x >= extent.z {
            0 // X
        } else if extent.y >= extent.z {
            1 // Y
        } else {
            2 // Z
        };

        // Sort indices by triangle centroid along chosen axis
        let tri_ref = triangles;
        indices[start..end].sort_by(|&a, &b| {
            let ca = match axis {
                0 => tri_ref[a].centroid.x,
                1 => tri_ref[a].centroid.y,
                _ => tri_ref[a].centroid.z,
            };
            let cb = match axis {
                0 => tri_ref[b].centroid.x,
                1 => tri_ref[b].centroid.y,
                _ => tri_ref[b].centroid.z,
            };
            ca.partial_cmp(&cb).unwrap_or(std::cmp::Ordering::Equal)
        });

        // Split at median
        let mid = start + count / 2;

        // Reserve slot for this internal node
        let node_idx = nodes.len();
        nodes.push(BVHNode {
            bounds_min,
            bounds_max,
            left: None,  // Will be filled in
            right: None, // Will be filled in
            triangle_start: 0,
            triangle_count: 0, // 0 indicates internal node
        });

        // Recursively build children
        let left_idx = Self::build_bvh_recursive(triangles, indices, start, mid, nodes);
        let right_idx = Self::build_bvh_recursive(triangles, indices, mid, end, nodes);

        // Update this node with child indices
        nodes[node_idx].left = Some(left_idx);
        nodes[node_idx].right = Some(right_idx);

        node_idx
    }

    /// Compute bounding box for a subset of triangles
    fn compute_bounds(triangles: &[Triangle], indices: &[usize]) -> (Vec3, Vec3) {
        let mut bounds_min = Vec3::splat(f32::MAX);
        let mut bounds_max = Vec3::splat(f32::MIN);

        for &idx in indices {
            let tri = &triangles[idx];
            bounds_min = bounds_min.min(tri.v0).min(tri.v1).min(tri.v2);
            bounds_max = bounds_max.max(tri.v0).max(tri.v1).max(tri.v2);
        }

        (bounds_min, bounds_max)
    }

    /// Compute maximum depth of BVH (for stats)
    fn compute_max_depth(&self, node_idx: usize, current_depth: usize) -> usize {
        if node_idx >= self.nodes.len() {
            return current_depth;
        }

        let node = &self.nodes[node_idx];

        if node.triangle_count > 0 {
            // Leaf node
            return current_depth;
        }

        let left_depth = node.left.map_or(current_depth, |l| {
            self.compute_max_depth(l, current_depth + 1)
        });
        let right_depth = node.right.map_or(current_depth, |r| {
            self.compute_max_depth(r, current_depth + 1)
        });

        left_depth.max(right_depth)
    }

    /// Iterative BVH traversal (faster than recursive for WASM)
    fn traverse_bvh(&self, origin: Vec3, direction: Vec3, inv_dir: Vec3) -> Option<RayHit> {
        if self.nodes.is_empty() {
            return None;
        }

        let mut stack = Vec::with_capacity(64); // Max depth we expect
        stack.push(0usize); // Root node

        let mut closest_hit: Option<RayHit> = None;
        let mut closest_t = f32::MAX;

        while let Some(node_idx) = stack.pop() {
            let node = &self.nodes[node_idx];

            // AABB intersection test with early termination
            if !self.ray_aabb_intersect(origin, inv_dir, node, closest_t) {
                continue;
            }

            if node.triangle_count > 0 {
                // Leaf node - test triangles
                for i in 0..node.triangle_count {
                    let tri_idx = self.triangle_indices[node.triangle_start + i];
                    if let Some(hit) =
                        self.ray_triangle_intersect(origin, direction, &self.triangles[tri_idx])
                    {
                        if hit.distance < closest_t {
                            closest_t = hit.distance;
                            closest_hit = Some(hit);
                        }
                    }
                }
            } else {
                // Internal node - push children onto stack
                // Push in reverse order so left is processed first (front-to-back)
                if let Some(right) = node.right {
                    stack.push(right);
                }
                if let Some(left) = node.left {
                    stack.push(left);
                }
            }
        }

        closest_hit
    }

    /// Ray-AABB intersection using slab method
    ///
    /// Uses pre-computed inverse direction for efficiency
    #[inline]
    fn ray_aabb_intersect(&self, origin: Vec3, inv_dir: Vec3, node: &BVHNode, max_t: f32) -> bool {
        let t1 = (node.bounds_min - origin) * inv_dir;
        let t2 = (node.bounds_max - origin) * inv_dir;

        let t_min_v = t1.min(t2);
        let t_max_v = t1.max(t2);

        let t_enter = t_min_v.x.max(t_min_v.y).max(t_min_v.z);
        let t_exit = t_max_v.x.min(t_max_v.y).min(t_max_v.z);

        // Ray intersects if entry < exit, exit >= 0, and entry < current best
        t_enter <= t_exit && t_exit >= 0.0 && t_enter < max_t
    }

    /// Möller–Trumbore ray-triangle intersection
    ///
    /// Fast algorithm that computes barycentric coordinates directly.
    /// Uses front-face culling (a < 0 = backface hit, rejected to match Three.js)
    #[inline]
    fn ray_triangle_intersect(&self, origin: Vec3, dir: Vec3, tri: &Triangle) -> Option<RayHit> {
        const EPSILON: f32 = 1e-7;

        let edge1 = tri.v1 - tri.v0;
        let edge2 = tri.v2 - tri.v0;
        let h = dir.cross(edge2);
        let a = edge1.dot(h);

        // Backface culling: a > 0 = front face, a < 0 = back face
        // Also rejects parallel rays (a ≈ 0)
        if a < EPSILON {
            return None;
        }

        let f = 1.0 / a;
        let s = origin - tri.v0;
        let u = f * s.dot(h);

        // Outside triangle (u coordinate)
        if !(0.0..=1.0).contains(&u) {
            return None;
        }

        let q = s.cross(edge1);
        let v = f * dir.dot(q);

        // Outside triangle (v coordinate or u+v > 1)
        if v < 0.0 || u + v > 1.0 {
            return None;
        }

        let t = f * edge2.dot(q);

        // Intersection in front of ray origin
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bvh_build() {
        // Simple cube geometry (8 vertices, 12 triangles)
        let positions: Vec<f32> = vec![
            // Front face
            -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0, // Back face
            -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0,
        ];

        let indices: Vec<u32> = vec![
            0, 1, 2, 0, 2, 3, // Front
            4, 6, 5, 4, 7, 6, // Back
            0, 3, 7, 0, 7, 4, // Left
            1, 5, 6, 1, 6, 2, // Right
            3, 2, 6, 3, 6, 7, // Top
            0, 4, 5, 0, 5, 1, // Bottom
        ];

        let raycaster = BVHRaycaster::from_geometry(&positions, &indices);

        assert_eq!(raycaster.triangles.len(), 12);
        assert!(raycaster.nodes.len() > 1, "BVH should have multiple nodes");

        let stats = raycaster.get_stats();
        println!(
            "BVH Stats: nodes={}, leaves={}, internal={}, depth={}, tris={}",
            stats[0], stats[1], stats[2], stats[3], stats[4]
        );
    }

    #[test]
    fn test_ray_hit() {
        // Unit cube centered at origin
        let positions: Vec<f32> = vec![
            -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, -1.0, 1.0,
            -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0,
        ];
        let indices: Vec<u32> = vec![
            0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2, 3, 2, 6, 3, 6,
            7, 0, 4, 5, 0, 5, 1,
        ];

        let raycaster = BVHRaycaster::from_geometry(&positions, &indices);

        // Ray from z=5 toward origin should hit front face at z=1
        let identity: [f32; 16] = [
            1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0,
        ];

        let hit = raycaster.intersect(&[0.0, 0.0, 5.0], &[0.0, 0.0, -1.0], &identity);
        assert!(hit.is_some(), "Should hit cube");

        let hit = hit.unwrap();
        assert!(
            (hit[2] - 1.0).abs() < 0.01,
            "Should hit at z=1, got z={}",
            hit[2]
        );
    }
}

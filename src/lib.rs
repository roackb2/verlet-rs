use glam::Vec2;
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub struct Point {
    position: Vec2,
    old_position: Vec2,
    acceleration: Vec2,
    is_pinned: bool,
}

#[wasm_bindgen]
impl Point {
    #[wasm_bindgen(constructor)]
    pub fn new(x: f32, y: f32) -> Point {
        let pos = Vec2::new(x, y);
        Point {
            position: pos,
            old_position: pos, // Start with no velocity
            acceleration: Vec2::ZERO,
            is_pinned: false,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn x(&self) -> f32 {
        self.position.x
    }

    #[wasm_bindgen(getter)]
    pub fn y(&self) -> f32 {
        self.position.y
    }

    #[wasm_bindgen(setter)]
    pub fn set_pinned(&mut self, pinned: bool) {
        self.is_pinned = pinned;
    }
}

#[wasm_bindgen]
#[derive(Clone, Copy, Debug)]
pub struct Stick {
    point_a_idx: usize,
    point_b_idx: usize,
    length: f32,
    stiffness: f32, // Added stiffness property
    tear_resistance: f32, // Added tear resistance
}

#[wasm_bindgen]
impl Stick {
     #[wasm_bindgen(constructor)]
     pub fn new(point_a_idx: usize, point_b_idx: usize, length: f32, stiffness: f32, tear_resistance: f32) -> Stick {
         Stick { point_a_idx, point_b_idx, length, stiffness, tear_resistance }
     }

    #[wasm_bindgen(getter)]
    pub fn point_a(&self) -> usize {
        self.point_a_idx
    }

     #[wasm_bindgen(getter)]
    pub fn point_b(&self) -> usize {
        self.point_b_idx
    }
}


#[wasm_bindgen]
pub struct Simulation {
    points: Vec<Point>,
    sticks: Vec<Stick>,
    width: f32,
    height: f32,
    gravity: Vec2,
    drag: f32,
    elasticity: f32, // General stick stiffness/elasticity (can be overridden per stick)
    tear_resistance_threshold: f32, // Threshold for sticks to tear
}

#[wasm_bindgen]
impl Simulation {
    #[wasm_bindgen(constructor)]
    pub fn new(width: f32, height: f32) -> Simulation {
        console_error_panic_hook::set_once(); // Optional: Better panic messages in console

        Simulation {
            points: Vec::new(),
            sticks: Vec::new(),
            width,
            height,
            gravity: Vec2::new(0.0, 981.0), // ~9.81 m/s^2, scaled up a bit
            drag: 0.01, // Default drag
            elasticity: 0.5, // Default elasticity
            tear_resistance_threshold: 100.0, // Default tear resistance
        }
    }

    // Basic getters for JS to get simulation data
    #[wasm_bindgen(getter)]
    pub fn points_ptr(&self) -> *const Point {
        self.points.as_ptr()
    }

    #[wasm_bindgen(getter)]
    pub fn points_count(&self) -> usize {
        self.points.len()
    }

     #[wasm_bindgen(getter)]
    pub fn sticks_ptr(&self) -> *const Stick {
        self.sticks.as_ptr()
    }

    #[wasm_bindgen(getter)]
    pub fn sticks_count(&self) -> usize {
        self.sticks.len()
    }

    // --- Methods to add points and sticks ---
    #[wasm_bindgen]
    pub fn add_point(&mut self, x: f32, y: f32, pinned: bool) -> usize {
        let mut point = Point::new(x,y);
        point.is_pinned = pinned;
        self.points.push(point);
        self.points.len() - 1 // Return the index of the added point
    }

    #[wasm_bindgen]
    pub fn add_stick(&mut self, p1_idx: usize, p2_idx: usize, stiffness_override: Option<f32>, tear_resist_override: Option<f32>) {
        if p1_idx >= self.points.len() || p2_idx >= self.points.len() {
            // Handle error or log: index out of bounds
            return;
        }
        let p1 = self.points[p1_idx];
        let p2 = self.points[p2_idx];
        let length = p1.position.distance(p2.position);
        let stiffness = stiffness_override.unwrap_or(self.elasticity);
        let tear_resistance = tear_resist_override.unwrap_or(self.tear_resistance_threshold);
        self.sticks.push(Stick::new(p1_idx, p2_idx, length, stiffness, tear_resistance));
    }

    // --- NEW: Bulk Data Access for JS Rendering ---
    #[wasm_bindgen]
    pub fn get_point_positions(&self) -> js_sys::Float32Array {
        // Create a flat array [x0, y0, x1, y1, ...]
        let mut positions = Vec::with_capacity(self.points.len() * 2);
        for point in &self.points {
            positions.push(point.position.x);
            positions.push(point.position.y);
        }
        // Use unsafe block because from_slice requires it, but it's safe
        // because we know the Vec<f32> data layout matches Float32Array.
        unsafe {
            js_sys::Float32Array::view(&positions)
        }
    }

    #[wasm_bindgen]
    pub fn get_stick_indices(&self) -> js_sys::Uint32Array {
         // Create a flat array [pA0, pB0, pA1, pB1, ...]
        let mut indices = Vec::with_capacity(self.sticks.len() * 2);
        for stick in &self.sticks {
            // Cast usize to u32 for JS compatibility
            indices.push(stick.point_a_idx as u32);
            indices.push(stick.point_b_idx as u32);
        }
        unsafe {
            js_sys::Uint32Array::view(&indices)
        }
    }

    // --- NEW: Interaction Methods ---
    #[wasm_bindgen]
    pub fn interact_cut(&mut self, x: f32, y: f32, radius: f32) {
        let mouse_pos = Vec2::new(x, y);
        let radius_sq = radius * radius;
        let mut sticks_to_remove = Vec::new();

        for i in (0..self.sticks.len()).rev() { // Iterate backwards for safe removal
            let stick = self.sticks[i];
            // Check if either point is within the radius
            let pa = self.points[stick.point_a_idx];
            let pb = self.points[stick.point_b_idx];

            if pa.position.distance_squared(mouse_pos) < radius_sq ||
               pb.position.distance_squared(mouse_pos) < radius_sq {
                // Simple approach: remove if either endpoint is close.
                // A more robust way might check intersection of stick segment with circle.
                sticks_to_remove.push(i);
            }
            // A slightly better check: distance from mouse to line segment
            // TODO: Implement line segment distance check if needed
        }

        for index in sticks_to_remove {
             if index < self.sticks.len() { // Double check index validity after potential previous removals
                 self.sticks.swap_remove(index);
             }
        }
    }

    #[wasm_bindgen]
    pub fn interact_pin_toggle(&mut self, x: f32, y: f32, radius: f32) {
        let mouse_pos = Vec2::new(x, y);
        let radius_sq = radius * radius;
        let mut closest_point_idx: Option<usize> = None;
        let mut min_dist_sq = radius_sq;

        // Find the closest point within the radius
        for (i, point) in self.points.iter().enumerate() {
            let dist_sq = point.position.distance_squared(mouse_pos);
            if dist_sq < min_dist_sq {
                min_dist_sq = dist_sq;
                closest_point_idx = Some(i);
            }
        }

        // Toggle the pin status of the closest point found
        if let Some(idx) = closest_point_idx {
            self.points[idx].is_pinned = !self.points[idx].is_pinned;
        }
    }

    #[wasm_bindgen]
    pub fn interact_pull_start(&mut self, x: f32, y: f32, radius: f32) -> usize {
        let mouse_pos = Vec2::new(x, y);
        let radius_sq = radius * radius;
        let mut closest_point_idx: Option<usize> = None;
        let mut min_dist_sq = radius_sq;

        // Find the closest non-pinned point within the radius
        for (i, point) in self.points.iter().enumerate() {
             if point.is_pinned { continue; }
            let dist_sq = point.position.distance_squared(mouse_pos);
            if dist_sq < min_dist_sq {
                min_dist_sq = dist_sq;
                closest_point_idx = Some(i);
            }
        }

        closest_point_idx.unwrap_or(usize::MAX) // Return index or usize::MAX if none found
    }

    #[wasm_bindgen]
    pub fn interact_pull_move(&mut self, point_index: usize, target_x: f32, target_y: f32) {
        if point_index < self.points.len() {
            // Ensure the point isn't pinned unexpectedly
             if self.points[point_index].is_pinned { return; }

            // Forcefully move the point to the target position
            let target_pos = Vec2::new(target_x, target_y);
            self.points[point_index].position = target_pos;
            // Also update old_position to prevent unnatural velocity jump on release?
            // Option 1: Set old_position to current -> stops motion instantly on release
             self.points[point_index].old_position = target_pos;
            // Option 2: Calculate implied velocity and set old_position accordingly (more complex)
            // Let's stick with Option 1 for now.
        }
    }

    // interact_pull_end is likely not needed if we just set position directly.

    // --- Placeholder for simulation step ---
    #[wasm_bindgen]
    pub fn update(&mut self, dt: f32, substeps: u32) {
       let sub_dt = dt / substeps as f32;
       for _ in 0..substeps {
           self.apply_gravity();
           self.update_points(sub_dt);
           // Apply stick constraints multiple times for stability
           // The number of iterations can be adjusted for performance vs accuracy
           for _ in 0..3 {
                self.update_sticks();
           }
           self.constrain_points();
       }
    }

    fn apply_gravity(&mut self) {
        let gravity_force = self.gravity;
        for point in self.points.iter_mut() {
            if !point.is_pinned {
                point.acceleration += gravity_force;
            }
        }
    }

    fn update_points(&mut self, dt: f32) {
        let drag_multiplier = 1.0 - self.drag;
        let dt_squared = dt * dt;

        for point in self.points.iter_mut() {
            if point.is_pinned {
                // Reset acceleration for pinned points but don't move them
                point.acceleration = Vec2::ZERO;
                continue;
            }

            // Verlet integration
            let velocity = (point.position - point.old_position) * drag_multiplier;
            let next_position = point.position + velocity + point.acceleration * dt_squared;

            point.old_position = point.position;
            point.position = next_position;

            // Reset acceleration for the next frame
            point.acceleration = Vec2::ZERO;
        }
    }

    fn update_sticks(&mut self) {
        let mut sticks_to_remove = Vec::new();
        for i in 0..self.sticks.len() {
            let stick = self.sticks[i]; // Operate on a copy

            // Need mutable access to two points simultaneously
            let (pa_idx, pb_idx) = (stick.point_a_idx, stick.point_b_idx);

            // Ensure indices are valid (should be guaranteed by add_stick, but good practice)
            if pa_idx >= self.points.len() || pb_idx >= self.points.len() {
                continue;
            }

            let (point_a, point_b) = {
                 // Split the mutable borrow to satisfy the borrow checker
                let (left, right) = self.points.split_at_mut(pa_idx.max(pb_idx));
                if pa_idx < pb_idx {
                    (&mut left[pa_idx], &mut right[0])
                } else {
                    (&mut right[0], &mut left[pb_idx])
                }
            };

            let delta = point_b.position - point_a.position;
            let distance = delta.length();
            let diff = (stick.length - distance) / distance.max(f32::EPSILON); // Avoid division by zero

            // Check for tearing
            // Simple approach: compare distance to a multiple of resting length based on tear resistance
            // A more robust check might involve force/tension, but this is simpler
            if distance > stick.length * stick.tear_resistance {
                 sticks_to_remove.push(i);
                 continue; // Don't apply constraint if it's tearing
            }


            let correction = delta * 0.5 * diff * stick.stiffness;

            // Distribute correction, respecting pinned points
            if !point_a.is_pinned && !point_b.is_pinned {
                point_a.position -= correction;
                point_b.position += correction;
            } else if !point_a.is_pinned {
                point_a.position -= correction * 2.0;
            } else if !point_b.is_pinned {
                point_b.position += correction * 2.0;
            }
        }

        // Remove torn sticks (iterate in reverse to avoid index issues)
        for &index in sticks_to_remove.iter().rev() {
            self.sticks.swap_remove(index);
        }
    }

    fn constrain_points(&mut self) {
        let width = self.width;
        let height = self.height;
        let drag_multiplier = 1.0 - self.drag; // Apply some drag on bounce

        for point in self.points.iter_mut() {
            if point.is_pinned {
                continue;
            }

            let velocity = (point.position - point.old_position) * drag_multiplier;

            // Boundary constraints (simple reflection)
            if point.position.x < 0.0 {
                point.position.x = 0.0;
                point.old_position.x = point.position.x + velocity.x;
            } else if point.position.x > width {
                point.position.x = width;
                point.old_position.x = point.position.x + velocity.x;
            }

            if point.position.y < 0.0 {
                point.position.y = 0.0;
                point.old_position.y = point.position.y + velocity.y;
            } else if point.position.y > height {
                point.position.y = height;
                point.old_position.y = point.position.y + velocity.y;
            }
        }
    }

    // --- Configuration methods ---
    #[wasm_bindgen]
    pub fn set_gravity(&mut self, x: f32, y: f32) {
        self.gravity = Vec2::new(x, y);
    }

     #[wasm_bindgen]
    pub fn set_drag(&mut self, drag: f32) {
        self.drag = drag.max(0.0); // Ensure non-negative drag
    }

    #[wasm_bindgen]
    pub fn set_elasticity(&mut self, elasticity: f32) {
        self.elasticity = elasticity.max(0.0);
    }

     #[wasm_bindgen]
    pub fn set_tear_resistance_threshold(&mut self, threshold: f32) {
        self.tear_resistance_threshold = threshold.max(0.0);
    }

    #[wasm_bindgen]
    pub fn clear(&mut self) {
        self.points.clear();
        self.sticks.clear();
    }
}


// Utility function for logging (optional)
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simulation_creation() {
        let sim = Simulation::new(800.0, 600.0);
        assert_eq!(sim.points_count(), 0);
        assert_eq!(sim.sticks_count(), 0);
        assert_eq!(sim.width, 800.0);
        assert_eq!(sim.height, 600.0);
    }

     #[test]
    fn add_points_and_sticks() {
        let mut sim = Simulation::new(800.0, 600.0);
        let p0 = sim.add_point(10.0, 10.0, false);
        let p1 = sim.add_point(20.0, 10.0, false);
        sim.add_stick(p0, p1, None, None);

        assert_eq!(sim.points_count(), 2);
        assert_eq!(sim.sticks_count(), 1);
        assert_eq!(sim.sticks[0].point_a(), 0);
        assert_eq!(sim.sticks[0].point_b(), 1);
        assert_eq!(sim.sticks[0].length, 10.0); // Distance between (10,10) and (20,10)
        assert_eq!(sim.sticks[0].stiffness, sim.elasticity); // Should use default
        assert_eq!(sim.sticks[0].tear_resistance, sim.tear_resistance_threshold); // Should use default
    }
}

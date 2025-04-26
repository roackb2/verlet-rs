import init, { Simulation, Point, Stick } from '../pkg/verlet_rs.js';

async function run() {
    // Initialize the WASM module
    const wasm = await init();
    const memory = wasm.memory;

    // --- Canvas Setup ---
    const canvas = document.getElementById('simulation-canvas');
    const ctx = canvas.getContext('2d');
    let width = window.innerWidth - 250; // Subtract controls width
    let height = window.innerHeight;

    function resizeCanvas() {
        width = window.innerWidth - 250;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
        console.log(`Resized to ${width}x${height}`);
        if (simulation) {
            // We need a way to update simulation bounds or regenerate
            simulation.update_bounds(width, height); // Need to add this method to Rust
            // Alternatively, force regeneration on resize:
            // generateCloth();
        }
    }
    window.addEventListener('resize', resizeCanvas);
    // resizeCanvas(); // Initial size <-- MOVED

    // --- Simulation Setup ---
    let simulation = new Simulation(width, height);
    resizeCanvas(); // Initial size <-- MOVED HERE
    let substeps = 5;
    let drawPoints = true;

    // --- Interaction State ---
    let mouse = { x: 0, y: 0, isDown: false, button: 0 };
    let interactionTargetPointIndex = null; // Revert to single index
    let prevMouse = { x: 0, y: 0 }; // Track previous mouse position for velocity

    // --- UI Controls Setup ---
    const controls = {
        integrity: document.getElementById('integrity'),
        integrityValue: document.getElementById('integrity-value'),
        pinning: document.getElementById('pinning'),
        generateButton: document.getElementById('generate-button'),
        drag: document.getElementById('drag'),
        dragValue: document.getElementById('drag-value'),
        stiffness: document.getElementById('stiffness'),
        stiffnessValue: document.getElementById('stiffness-value'),
        tearResist: document.getElementById('tear-resist'),
        tearResistValue: document.getElementById('tear-resist-value'),
        gravity: document.getElementById('gravity'),
        gravityValue: document.getElementById('gravity-value'),
        substeps: document.getElementById('substeps'),
        substepsValue: document.getElementById('substeps-value'),
        drawPoints: document.getElementById('draw-points'),
        mouseAction: document.getElementById('mouse-action'),
        mouseRadius: document.getElementById('mouse-radius'),
        mouseRadiusValue: document.getElementById('mouse-radius-value'),
        clothType: document.getElementById('cloth-type'),
    };

    // Function to update value display next to sliders
    function updateValueDisplay(slider, display) {
        display.textContent = slider.value;
    }

    // Initial physics values from UI
    simulation.set_drag(parseFloat(controls.drag.value));
    simulation.set_elasticity(parseFloat(controls.stiffness.value));
    simulation.set_tear_resistance_threshold(parseFloat(controls.tearResist.value));
    simulation.set_gravity(0.0, parseFloat(controls.gravity.value));
    substeps = parseInt(controls.substeps.value);
    drawPoints = controls.drawPoints.checked;

    // Update displays
    updateValueDisplay(controls.integrity, controls.integrityValue);
    updateValueDisplay(controls.drag, controls.dragValue);
    updateValueDisplay(controls.stiffness, controls.stiffnessValue);
    updateValueDisplay(controls.tearResist, controls.tearResistValue);
    updateValueDisplay(controls.gravity, controls.gravityValue);
    updateValueDisplay(controls.substeps, controls.substepsValue);
    updateValueDisplay(controls.mouseRadius, controls.mouseRadiusValue);

    // Event Listeners for Controls
    controls.integrity.addEventListener('input', () => updateValueDisplay(controls.integrity, controls.integrityValue));
    controls.drag.addEventListener('input', () => {
        updateValueDisplay(controls.drag, controls.dragValue);
        simulation.set_drag(parseFloat(controls.drag.value));
    });
    controls.stiffness.addEventListener('input', () => {
        updateValueDisplay(controls.stiffness, controls.stiffnessValue);
        simulation.set_elasticity(parseFloat(controls.stiffness.value));
    });
    controls.tearResist.addEventListener('input', () => {
        updateValueDisplay(controls.tearResist, controls.tearResistValue);
        simulation.set_tear_resistance_threshold(parseFloat(controls.tearResist.value));
    });
    controls.gravity.addEventListener('input', () => {
        updateValueDisplay(controls.gravity, controls.gravityValue);
        simulation.set_gravity(0.0, parseFloat(controls.gravity.value));
    });
     controls.substeps.addEventListener('input', () => {
        updateValueDisplay(controls.substeps, controls.substepsValue);
        substeps = parseInt(controls.substeps.value);
    });
    controls.mouseRadius.addEventListener('input', () => updateValueDisplay(controls.mouseRadius, controls.mouseRadiusValue));
    controls.drawPoints.addEventListener('change', () => {
        drawPoints = controls.drawPoints.checked;
    });

    // --- Cloth Generation ---
    function generateCloth() {
        simulation.clear(); // Clear existing points and sticks

        const type = controls.clothType.value;
        const size = parseInt(controls.integrity.value);
        const pinning = controls.pinning.value;
        const spacing = 20; // Spacing between points
        const startX = (width - (size - 1) * spacing) / 2;
        const startY = 50;

        if (type === 'grid') {
            let points = [];
            for (let y = 0; y < size; y++) {
                let row = [];
                for (let x = 0; x < size; x++) {
                    let px = startX + x * spacing;
                    let py = startY + y * spacing;
                    let pinned = false;
                    if (pinning === 'top' && y === 0) pinned = true;
                    if (pinning === 'corners' && y === 0 && (x === 0 || x === size - 1)) pinned = true;

                    let pointIndex = simulation.add_point(px, py, pinned);
                    row.push(pointIndex);

                    // Add horizontal sticks
                    if (x > 0) {
                        simulation.add_stick(pointIndex, row[x - 1], null, null);
                    }
                    // Add vertical sticks
                    if (y > 0) {
                        simulation.add_stick(pointIndex, points[y - 1][x], null, null);
                    }
                     // Add diagonal sticks (shear constraints)
                    // if (x > 0 && y > 0) {
                    //     simulation.add_stick(pointIndex, points[y - 1][x - 1], null, null);
                    //     simulation.add_stick(row[x - 1], points[y - 1][x], null, null);
                    // }
                }
                points.push(row);
            }
        } else if (type === 'spiderweb') {
            const numRadials = 10; // Number of spokes
            const numSegments = size; // Use 'integrity' slider for segments per spoke
            const center = { x: width / 2, y: height / 4 }; // Start near top-center
            const maxRadius = Math.min(width, height) * 0.4; // Max radius of the web
            const segmentLength = maxRadius / numSegments;
            const angleIncrement = (2 * Math.PI) / numRadials;

            let radialPoints = Array(numRadials).fill(null).map(() => []); // Stores point indices for each radial

            // --- Create Points ---
            // Center point (usually pinned)
            let centerPointIndex = simulation.add_point(center.x, center.y, pinning === 'center'); // Pin center if selected
            radialPoints.forEach(radial => radial.push(centerPointIndex)); // All radials start at the center

            // Radial points
            for (let seg = 1; seg <= numSegments; seg++) {
                const radius = seg * segmentLength;
                for (let rad = 0; rad < numRadials; rad++) {
                    const angle = rad * angleIncrement;
                    const px = center.x + Math.cos(angle) * radius;
                    const py = center.y + Math.sin(angle) * radius;

                    // Pinning: 'top' pins the outermost point of the top-most radials
                    // Pinning: 'edges' pins all outermost points
                    let pinned = false;
                    if (seg === numSegments) { // Outermost points
                        if (pinning === 'edges') {
                            pinned = true;
                        } else if (pinning === 'corners') { // Map grid 'Corners' to spiderweb 'Edges'
                            pinned = true;
                        } else if (pinning === 'top') {
                            // Pin points near the top (e.g., within the top 90 degrees)
                            // Angle for top vertical is -PI/2 or 3*PI/2
                            const topAngle = -Math.PI / 2;
                            let angleDiff = Math.atan2(Math.sin(angle - topAngle), Math.cos(angle - topAngle)); // Angle difference in [-PI, PI]
                            if (Math.abs(angleDiff) <= Math.PI / 4) { // Pin if within +/- 45 degrees of top
                                pinned = true;
                            }
                        }
                    }
                    if (pinning === 'center' && seg === 0) {
                         // Center point pinning is handled when creating the center point
                    }

                    let pointIndex = simulation.add_point(px, py, pinned);
                    radialPoints[rad].push(pointIndex);
                }
            }

            // --- Create Sticks ---
            for (let rad = 0; rad < numRadials; rad++) {
                for (let seg = 0; seg < numSegments; seg++) {
                    // Radial sticks (connecting points along a spoke)
                    simulation.add_stick(radialPoints[rad][seg], radialPoints[rad][seg + 1], null, null);

                    // Spiral sticks (connecting points between adjacent spokes)
                    if (seg > 0) { // Don't connect the center point in a spiral
                        const nextRad = (rad + 1) % numRadials; // Wrap around for the last radial
                        simulation.add_stick(radialPoints[rad][seg], radialPoints[nextRad][seg], null, null);
                    }
                }
                 // Connect the outermost points with spirals as well
                 if (numSegments > 0) {
                    const nextRad = (rad + 1) % numRadials;
                    simulation.add_stick(radialPoints[rad][numSegments], radialPoints[nextRad][numSegments], null, null);
                 }
            }
        }
        // Access as property, not function
        console.log(`Generated ${type} cloth: ${simulation.points_count} points, ${simulation.sticks_count} sticks`);
    }

    controls.generateButton.addEventListener('click', generateCloth);
    generateCloth(); // Generate initial cloth

    // --- Interaction Logic ---
    function getMousePos(canvas, evt) {
        const rect = canvas.getBoundingClientRect();
        // Handle touch events
        if (evt.touches && evt.touches.length > 0) {
             return {
                x: evt.touches[0].clientX - rect.left,
                y: evt.touches[0].clientY - rect.top
            };
        }
        // Handle mouse events
        return {
            x: evt.clientX - rect.left,
            y: evt.clientY - rect.top
        };
    }

    function handleInteractionStart(evt) {
        evt.preventDefault(); // Prevent default touch actions like scrolling
        mouse.isDown = true;
        mouse.button = evt.button; // 0 = left, 1 = middle, 2 = right
        const pos = getMousePos(canvas, evt);
        mouse.x = pos.x;
        mouse.y = pos.y;

        const action = controls.mouseAction.value;
        const radius = parseFloat(controls.mouseRadius.value);

        if (mouse.button === 0) { // Left click / single touch
            if (action === 'cut') {
                // Call Rust function (to be implemented)
                simulation.interact_cut(mouse.x, mouse.y, radius);
            } else if (action === 'pin') {
                // Call Rust function (to be implemented)
                simulation.interact_pin_toggle(mouse.x, mouse.y, radius);
            } else if (action === 'pull') {
                // Call Rust function (to be implemented) - get index of point to pull
                 interactionTargetPointIndex = simulation.interact_pull_start(mouse.x, mouse.y, radius);
                // // Rust function now returns an array of indices
                // interactionTargetPointIndices = simulation.interact_pull_start(mouse.x, mouse.y, radius);
                // // No need to check for MAX_SAFE_INTEGER anymore
                 // If no point is found, interact_pull_start should return a specific value (e.g., usize::MAX -> check in JS)
                  if (interactionTargetPointIndex === Number.MAX_SAFE_INTEGER) { // Assuming usize::MAX maps near this
                     interactionTargetPointIndex = null;
                  }
                // if (interactionTargetPointIndices.length > 0) {
                //     console.log(`Started pulling ${interactionTargetPointIndices.length} points.`);
                // }
            }
        } else if (mouse.button === 2) { // Right click / two fingers (TODO: Implement Pan)
            console.log("Pan started (TODO)");
        }
    }

    function handleInteractionMove(evt) {
        evt.preventDefault();
        // Store previous mouse position BEFORE updating current
        prevMouse.x = mouse.x;
        prevMouse.y = mouse.y;

        const pos = getMousePos(canvas, evt);
        mouse.x = pos.x;
        mouse.y = pos.y;

        if (mouse.isDown && mouse.button === 0) { // Left drag / single touch move
             const action = controls.mouseAction.value;
             // if (action === 'pull' && interactionTargetPointIndices.length > 0) {
             //     // Pass the array of indices to the Rust function
             //     simulation.interact_pull_move(interactionTargetPointIndices, mouse.x, mouse.y);
             // }
             if (action === 'pull' && interactionTargetPointIndex !== null) { // Check single index
                 simulation.interact_pull_move(interactionTargetPointIndex, mouse.x, mouse.y);
             } else if (action === 'cut') {
                 // Continuous cutting while dragging
                 const radius = parseFloat(controls.mouseRadius.value);
                 simulation.interact_cut(mouse.x, mouse.y, radius);
             }
        } else if (mouse.isDown && mouse.button === 2) { // Right drag / two finger move (TODO: Implement Pan)
             // console.log("Panning (TODO)");
        }
    }

    function handleInteractionEnd(evt) {
         evt.preventDefault();
         if (mouse.isDown) {
             if (mouse.button === 0) { // Left release / single touch end
                 if (interactionTargetPointIndex !== null) { // Check single index
                     // Calculate final mouse velocity
                    const velocityX = mouse.x - prevMouse.x;
                    const velocityY = mouse.y - prevMouse.y;
                     // Call Rust function to apply release velocity
                    simulation.interact_pull_end(interactionTargetPointIndex, velocityX, velocityY);
                     interactionTargetPointIndex = null;
                 }
             } else if (mouse.button === 2) {
                 console.log("Pan ended (TODO)");
             }
             mouse.isDown = false;
         }
    }

    // Add event listeners to the canvas
    canvas.addEventListener('mousedown', handleInteractionStart);
    canvas.addEventListener('mousemove', handleInteractionMove);
    canvas.addEventListener('mouseup', handleInteractionEnd);
    canvas.addEventListener('mouseleave', handleInteractionEnd); // End interaction if mouse leaves canvas

    canvas.addEventListener('touchstart', handleInteractionStart, { passive: false });
    canvas.addEventListener('touchmove', handleInteractionMove, { passive: false });
    canvas.addEventListener('touchend', handleInteractionEnd);
    canvas.addEventListener('touchcancel', handleInteractionEnd);

    // Prevent context menu on right-click
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // --- Rendering Logic ---
    function draw() {
        ctx.clearRect(0, 0, width, height);

        // Get data from WASM using the new efficient methods
        // Access as properties
        const pointsCount = simulation.points_count;
        const sticksCount = simulation.sticks_count;

        if (pointsCount === 0) return; // Nothing to draw

        const pointPositions = simulation.get_point_positions(); // Returns Float32Array [x0, y0, x1, y1, ...]
        const stickIndices = simulation.get_stick_indices();     // Returns Uint32Array [pA0, pB0, pA1, pB1, ...]

        // --- Drawing Sticks ---
        ctx.beginPath();
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        for (let i = 0; i < sticksCount; i++) {
            const p1_idx = stickIndices[i * 2];
            const p2_idx = stickIndices[i * 2 + 1];

            // Get positions from the flat array
            const p1_x = pointPositions[p1_idx * 2];
            const p1_y = pointPositions[p1_idx * 2 + 1];
            const p2_x = pointPositions[p2_idx * 2];
            const p2_y = pointPositions[p2_idx * 2 + 1];

            // Check if indices are valid (mainly for safety during potential tearing/removal)
            if (p1_idx < pointsCount && p2_idx < pointsCount &&
                p1_x !== undefined && p1_y !== undefined &&
                p2_x !== undefined && p2_y !== undefined) {
                 ctx.moveTo(p1_x, p1_y);
                 ctx.lineTo(p2_x, p2_y);
            } else {
                // This might happen momentarily if a point involved in a stick was just removed
                // console.warn(`Invalid stick index or position data for stick ${i}: P1(${p1_idx}), P2(${p2_idx})`);
            }
        }
        ctx.stroke();

        // --- Drawing Points ---
        if (drawPoints) {
            ctx.fillStyle = '#ff6666';
            for (let i = 0; i < pointsCount; i++) {
                 const x = pointPositions[i * 2];
                 const y = pointPositions[i * 2 + 1];
                 if (x !== undefined && y !== undefined) {
                    ctx.beginPath();
                    ctx.arc(x, y, 2, 0, Math.PI * 2);
                    ctx.fill();
                 }
            }
        }

        // --- Draw Interaction Radius ---
        if (controls.mouseAction.value !== 'none') {
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)'; // Yellow circle for interaction radius
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(mouse.x, mouse.y, parseFloat(controls.mouseRadius.value), 0, Math.PI * 2);
            ctx.stroke();
        }

        // Visualize pulling line
        // // Optional: Visualize lines to all pulled points?
        // if (interactionTargetPointIndices.length > 0) {
        //     ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)'; // Semi-transparent green lines
        //     ctx.lineWidth = 1;
        //     ctx.beginPath();
        //     for (const index of interactionTargetPointIndices) {
        //         const pointX = pointPositions[index * 2];
        //         const pointY = pointPositions[index * 2 + 1];
        //         if (pointX !== undefined && pointY !== undefined) {
        //             ctx.moveTo(pointX, pointY);
        //             ctx.lineTo(mouse.x, mouse.y);
        //         }
        //     }
        //     ctx.stroke();
        // }
        // Revert to visualizing line to single point
        if (interactionTargetPointIndex !== null) {
             const pointX = pointPositions[interactionTargetPointIndex * 2];
             const pointY = pointPositions[interactionTargetPointIndex * 2 + 1];
             if (pointX !== undefined && pointY !== undefined) {
                 ctx.strokeStyle = 'rgba(0, 255, 0, 0.7)'; // Green line
                 ctx.lineWidth = 2;
                 ctx.beginPath();
                 ctx.moveTo(pointX, pointY);
                 ctx.lineTo(mouse.x, mouse.y);
                 ctx.stroke();
             }
        }
    }

    // --- Animation Loop ---
    let lastTime = 0;
    function loop(currentTime) {
        const deltaTime = (currentTime - lastTime) / 1000; // Delta time in seconds
        lastTime = currentTime;

        // Update simulation (adjust dt if needed, e.g., max frame time)
        const dt = Math.min(deltaTime, 1 / 30); // Clamp dt to avoid large steps
        if (!isNaN(dt)) {
            simulation.update(dt, substeps);
        }

        // Render
        draw(); // Re-enabled drawing

        requestAnimationFrame(loop);
    }

    // Start the loop
    requestAnimationFrame(loop);

    console.log('Simulation initialized.');

}

run().catch(console.error);

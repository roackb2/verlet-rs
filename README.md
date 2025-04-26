# Rust + WASM 2D Cloth Simulation

A real-time 2D cloth simulation using Verlet integration, implemented in Rust and compiled to WebAssembly (WASM) for interactive web deployment.

## Inspiration

This project was inspired by the fantastic 2D Cloth Physics Simulation demonstrated by [@cloudofoz](https://x.com/cloudofoz) on X:

[https://x.com/cloudofoz/status/1915386813763461429](https://x.com/cloudofoz/status/1915386813763461429)

*(Image from the original post for reference)*
<!-- TODO: Replace with a local screenshot of this project -->
<img src="https://pbs.twimg.com/media/GS9U38QW4AAVJ9k?format=jpg&name=medium" alt="Inspiration Demo Screenshot" width="600"/>

## Features

*   Real-time physics simulation using Verlet integration.
*   Cloth generation (currently grid-based).
*   Adjustable physics parameters via UI controls:
    *   Drag
    *   Stiffness
    *   Tear Resistance
    *   Gravity
    *   Simulation Substeps
*   Interactive mouse/touch controls:
    *   Cut sticks
    *   Pin/Unpin points
    *   Pull points
*   Written in Rust, compiled to WebAssembly.
*   Rendered on an HTML Canvas.

## Prerequisites

*   **Rust Toolchain:** Includes `rustc` and `cargo`. Install via [rustup](https://rustup.rs/).
*   **`wasm-pack`:** Used to build the WASM package. Install via `cargo install wasm-pack`.
*   **Web Browser:** Any modern browser supporting WebAssembly.
*   **Simple HTTP Server:** Required to serve the files locally due to browser security restrictions when loading WASM. Examples:
    *   Python: `python3 -m http.server`
    *   Node.js: `npx http-server` (install via `npm install -g http-server` if needed)

## Build

1.  Ensure you are in the `verlet-rs` directory (this directory).
2.  Run the build command using Make:
    ```bash
    make build
    ```
    Alternatively, run `wasm-pack` directly:
    ```bash
    wasm-pack build --target web
    ```
    This will create/update the `pkg` directory.

## Run

1.  Ensure you are in the `verlet-rs` directory.
2.  Build the project if you haven't already (`make build`).
3.  Start the development server using Make:
    ```bash
    make run
    ```
    (This uses `npx http-server` internally). Alternatively, run `npx http-server` directly:
    ```bash
    # Serve from current directory (.) on port 8091, disable caching (-c-1)
    npx http-server . -p 8091 -c-1
    ```
    *(If you prefer Python, you can use `python3 -m http.server 8091` instead)*
4.  Open your web browser and navigate to: `http://localhost:8091/www/index.html`
    (Or `http://127.0.0.1:8091/www/index.html`)

## Project Structure

```
verlet-rs/           # Project root
├── src/             # Rust source code (lib.rs)
├── pkg/             # Generated WASM/JS package (via wasm-pack)
├── www/             # Frontend files
│   ├── index.html
│   └── index.js
├── .gitignore       # Optional: Git ignore file
├── Cargo.lock
├── Cargo.toml       # Rust package manifest
├── Makefile         # Build/run automation
└── README.md        # This file
```

## TODO / Future Work

*   Implement spiderweb generation.
*   Implement pan and zoom controls.
*   Refine mouse interaction logic (e.g., more precise cutting).
*   Address build warnings (`wee_alloc`, unused `console_log`).
*   Performance optimizations.
*   Add more cloth generation options.

## License

Consider adding a license file (e.g., MIT or Apache-2.0).

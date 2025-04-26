# Makefile for Rust WASM Cloth Simulation (run from verlet-rs directory)

# Variables
WWW_DIR = www
PKG_DIR = pkg
TARGET_DIR = target
SERVER_PORT = 8091

# Default target: Build the WASM package
.PHONY: all
all: build

# Build the WASM package using wasm-pack
.PHONY: build
build:
	@echo "Building WASM package..."
	wasm-pack build --target web
	@echo "Build complete. Package available in $(PKG_DIR)"

# Serve the application using Node.js http-server and open the browser
# Serves from the current directory (verlet-rs)
.PHONY: serve
serve:
	@echo "Starting server from current directory ($(CURDIR))..."
	@echo "Opening application at: http://localhost:$(SERVER_PORT)/$(WWW_DIR)/index.html"
	@echo "Press Ctrl+C in the terminal to stop the server."
	npx http-server . -p $(SERVER_PORT) -c-1 -o /$(WWW_DIR)/index.html

# Alias for serve
.PHONY: run
run: serve

# Clean generated artifacts
.PHONY: clean
clean:
	@echo "Cleaning generated files (pkg and target directories)..."
	rm -rf $(PKG_DIR) $(TARGET_DIR)
	@echo "Clean complete."

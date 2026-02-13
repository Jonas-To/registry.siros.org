.PHONY: all build serve clean install lint help

# Configuration
PORT ?= 8000

# Default target
all: build

# Install dependencies
install:
	npm ci

# Build the static site
build:
	npm run build

# Run local development server
serve: build
	cd $(CURDIR) && npx http-server dist -p $(PORT)

# Clean build artifacts
clean:
	rm -rf dist/

# Run linting
lint:
	npm run lint

# Watch for changes and rebuild (requires entr or similar)
watch:
	@echo "Watching for changes... (Ctrl+C to stop)"
	@find scripts templates static config -type f | entr -r make serve

# Help
help:
	@echo "Available targets:"
	@echo "  make install       - Install Node.js dependencies"
	@echo "  make build         - Build the static site to dist/"
	@echo "  make serve         - Build and start local dev server at http://localhost:$(PORT)"
	@echo "  make serve PORT=N  - Use a different port"
	@echo "  make clean         - Remove build artifacts"
	@echo "  make lint          - Run ESLint"
	@echo "  make watch         - Watch for changes and auto-rebuild (requires entr)"
	@echo "  make help          - Show this help message"

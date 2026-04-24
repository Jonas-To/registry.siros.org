.PHONY: all build serve clean install help build-legacy

# Configuration
PORT ?= 8000
BASE_URL ?= https://registry.siros.org
REGISTRY_CLI ?= registry-cli
OUTPUT ?= dist

# Default target
all: build

# Install registry-cli (requires Go 1.22+)
install:
	go install github.com/sirosfoundation/registry-cli/cmd/registry-cli@latest

# Build the static site using registry-cli
build:
	$(REGISTRY_CLI) build \
		--sources sources.yaml \
		--output $(OUTPUT) \
		--base-url $(BASE_URL) \
		--templates templates-go \
		--static static
	cp CNAME $(OUTPUT)/CNAME

# Run local development server
serve: build
	python3 -m http.server $(PORT) --directory $(OUTPUT)

# Clean build artifacts
clean:
	rm -rf $(OUTPUT)/

# Legacy build (Node.js — archived, use for comparison only)
build-legacy:
	npm ci && npm run build

# Help
help:
	@echo "Available targets:"
	@echo "  make install       - Install registry-cli (requires Go)"
	@echo "  make build         - Build the static site to $(OUTPUT)/"
	@echo "  make serve         - Build and start local dev server at http://localhost:$(PORT)"
	@echo "  make serve PORT=N  - Use a different port"
	@echo "  make clean         - Remove build artifacts"
	@echo "  make build-legacy  - Build using archived Node.js pipeline"
	@echo "  make help          - Show this help message"

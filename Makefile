.PHONY: dev build build-wasm build-wasm-release clean \
        lint lint-rust lint-js fmt fmt-rust fmt-js \
        check check-rust check-js clippy test

dev:
	npm run dev

build: build-wasm-release
	npm run build

build-prod:
	npm run build

build-wasm:
	cd wasm && wasm-pack build --target web --dev

build-wasm-release:
	cd wasm && wasm-pack build --target web --release

lint: lint-rust lint-js

lint-rust: clippy
	cd wasm && cargo fmt --check

lint-js:
	npx eslint src/ --ext .js

clippy:
	cd wasm && cargo clippy --target wasm32-unknown-unknown -- -D warnings

fmt: fmt-rust fmt-js

fmt-rust:
	cd wasm && cargo fmt

fmt-js:
	npx prettier --write "src/**/*.js"

check: check-rust check-js

check-rust:
	cd wasm && cargo check --target wasm32-unknown-unknown

check-js:
	npx eslint src/ --ext .js --max-warnings 0

test: test-rust

test-rust:
	cd wasm && cargo test

clean:
	rm -rf dist/
	rm -rf wasm/target/
	rm -rf wasm/pkg/
	rm -rf node_modules/.vite/

all: fmt lint build

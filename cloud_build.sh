#!/bin/bash
set -ex
curl https://sh.rustup.rs -sSf | sh -s -- -y
. "$HOME/.cargo/env"
rustup target add wasm32-unknown-unknown
npm run build:wasm
npm run build

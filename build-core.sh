#!/bin/sh
# Builds the shared core (core/, the assistant-core submodule) for the browser and puts it where the
# app imports it: generated/ (the WebAssembly, and wasm-bindgen's JavaScript and types for it).
# Needs Rust's wasm32-unknown-unknown target and wasm-bindgen-cli at the version core/ uses.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
export PATH="/opt/homebrew/opt/rustup/bin:$HOME/.cargo/bin:$PATH"
cd "$here/core"
cargo build --release --lib --target wasm32-unknown-unknown --features web
rm -rf "$here/generated"
wasm-bindgen --target web --out-dir "$here/generated" target/wasm32-unknown-unknown/release/assistant_core.wasm

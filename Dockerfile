# The shared core (core/, the assistant-core submodule) for the browser: what build-core.sh makes.
FROM rust:1.99.1-slim-bookworm AS core
RUN rustup target add wasm32-unknown-unknown && cargo install wasm-bindgen-cli --version 0.2.129 --locked
WORKDIR /src/core
COPY core/ ./
RUN cargo build --release --lib --target wasm32-unknown-unknown --features web \
 && wasm-bindgen --target web --out-dir /src/generated target/wasm32-unknown-unknown/release/assistant_core.wasm

# Build
FROM node:24.22.0-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
COPY --from=core /src/generated ./generated
RUN npm run build

# Serve
FROM nginxinc/nginx-unprivileged:1.31.7-alpine
ENV API_UPSTREAM=http://assistant-api:8080
# Only API_UPSTREAM is substituted; nginx's own $variables stay as they are.
ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080 8081

# Build
FROM node:24.22.0-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve
FROM nginxinc/nginx-unprivileged:1.31.7-alpine
ENV API_UPSTREAM=http://assistant-api:8080 \
    GOOGLE_CLIENT_ID=""
# Only API_UPSTREAM is substituted; nginx's own $variables stay as they are.
ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 docker/40-assistant-config.sh /docker-entrypoint.d/40-assistant-config.sh
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080

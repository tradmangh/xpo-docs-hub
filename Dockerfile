# Dockerfile — build arg SITE=internal|public
FROM node:22-alpine AS build
ARG SITE=public
ARG GH_TOKEN
RUN apk add --no-cache git
WORKDIR /hub
COPY package*.json ./
RUN npm ci
COPY . .
RUN mkdir -p ui/js && cp node_modules/mermaid/dist/mermaid.min.js ui/js/mermaid.min.js
RUN --mount=type=secret,id=gh_token sh scripts/write-credentials.sh && npm run build:${SITE} && rm -f .git-credentials

FROM nginx:1.27-alpine
ARG SITE=public
COPY nginx/${SITE}.conf /etc/nginx/conf.d/default.conf
COPY --from=build /hub/build/${SITE} /usr/share/nginx/html

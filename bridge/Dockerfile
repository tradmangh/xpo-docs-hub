# bridge/Dockerfile (build context = hub root)
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY bridge/package*.json bridge/
RUN npm ci --omit=dev && cd bridge && npm install --omit=dev
COPY lib lib
COPY components.yml ./
COPY bridge/*.js bridge/
USER node
CMD ["node", "bridge/server.js"]

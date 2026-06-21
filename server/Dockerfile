FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev --workspace server \
  && npm cache clean --force \
  && mkdir -p /data \
  && chown node:node /data

COPY --chown=node:node server server

USER node
WORKDIR /app/server
EXPOSE 4000

CMD ["npm", "start"]


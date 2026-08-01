# TenantPro backend — portable container image.
# Works on Render, Railway, Fly.io, or any Docker host.

FROM node:20-alpine

# App directory
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the rest of the source
COPY . .

# Render/Railway inject PORT at runtime; default to 5000 for local docker runs.
ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]

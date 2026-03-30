FROM node:20-alpine AS builder

WORKDIR /app

# Copy package descriptors and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the Vite frontend (outputs to /dist)
RUN npm run build

# --- Production Stage ---
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the built frontend
COPY --from=builder /app/dist ./dist

# Copy the backend files (server.js, and api folder if relevant)
COPY server.js .
COPY api ./api

ENV PORT=8080
EXPOSE ${PORT}

CMD ["node", "server.js"]

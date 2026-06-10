# Stage 1: Build the React application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package descriptors and install dependencies
COPY package*.json ./
RUN npm ci

# Copy frontend source files
COPY . .

# Build React production bundle
RUN npm run build

# Stage 2: Serve built assets using Nginx
FROM nginx:alpine

# Copy built bundle from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy proxy configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Port 80 inside the container, mapped to 2343 on the host
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

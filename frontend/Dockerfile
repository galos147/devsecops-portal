FROM node:20-alpine AS builder
WORKDIR /app
ARG API_BACKEND_URL
ENV API_BACKEND_URL=${API_BACKEND_URL}
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN adduser -D appuser
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
USER appuser
EXPOSE 3000
CMD ["npm", "run", "start"]

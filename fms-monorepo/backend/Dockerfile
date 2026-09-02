FROM node:20-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN mkdir -p uploads
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]

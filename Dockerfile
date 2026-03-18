FROM node:20-bullseye-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production=false

COPY . .

RUN npx prisma generate
RUN npx tsc

CMD ["node", "dist/index.js"]

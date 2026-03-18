FROM node:20-slim

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production=false

COPY . .

RUN npx prisma generate
RUN npx tsc

CMD ["node", "dist/index.js"]

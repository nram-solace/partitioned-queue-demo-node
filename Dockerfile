FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY backend ./backend
COPY profiles ./profiles
COPY scripts ./scripts

CMD ["node", "backend/consumer.js"]

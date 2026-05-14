FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY backend ./backend
COPY profiles ./profiles

COPY docker/demo.apps.env ./demo.env

CMD ["node", "backend/consumer.js"]

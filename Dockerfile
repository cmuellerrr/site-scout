FROM node:20-slim

# Install Chromium via apt so there's no runtime download needed
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip its own Chrome download and use the system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Set production env after build so devDependencies were available during build
ENV NODE_ENV=production

EXPOSE 10000

CMD ["npm", "start"]

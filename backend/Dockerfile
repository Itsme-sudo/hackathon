FROM node:18-bullseye-slim

WORKDIR /app

# Install python and scientific dependencies
RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

COPY analysis/requirements.txt ./analysis/requirements.txt
RUN pip3 install --no-cache-dir -r ./analysis/requirements.txt

COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

COPY . .
RUN cd frontend && npm install && npm run build

EXPOSE 5000

CMD ["node", "backend/server.js"]

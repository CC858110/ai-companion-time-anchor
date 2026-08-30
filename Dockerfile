# 根目录 Dockerfile - 只是为了引导 Zeabur 使用 server/ 下的真实 Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/ .
RUN npm install
CMD ["node", "src/index.js"]

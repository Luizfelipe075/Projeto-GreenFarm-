FROM node:20-alpine
WORKDIR /app
COPY package.json server.js app.js styles.css index.html ./
COPY ["Logo Gestao Saude.png", "./"]
RUN mkdir -p /data
ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 4173
CMD ["npm", "start"]

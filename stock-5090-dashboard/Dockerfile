FROM node:22-bookworm-slim
WORKDIR /app
COPY server ./server
COPY public ./public
COPY data ./data
COPY config.json ./config.json
EXPOSE 4388
ENV STOCK_DASHBOARD_PORT=4388
CMD ["node", "server/server.js"]

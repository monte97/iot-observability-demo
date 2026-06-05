FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
ENV OTEL_SERVICE_NAME=device-gateway
CMD ["node", "--require", "./tracing.js", "index.js"]

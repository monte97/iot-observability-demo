FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --timeout 120 --retries 5 -r requirements.txt
COPY . .
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
ENV OTEL_SERVICE_NAME=normalizer
ENV OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
CMD ["opentelemetry-instrument", "python", "app.py"]

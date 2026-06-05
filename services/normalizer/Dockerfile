FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --timeout 120 --retries 5 -r requirements.txt
COPY . .
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
ENV OTEL_SERVICE_NAME=normalizer
ENV OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
# Esporta anche i log via OTLP: aggancia un handler OTLP al root logger Python.
ENV OTEL_LOGS_EXPORTER=otlp
ENV OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED=true
CMD ["opentelemetry-instrument", "python", "app.py"]

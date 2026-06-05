FROM gradle:8-jdk21 AS build
WORKDIR /src
COPY . .
RUN gradle shadowJar --no-daemon

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/build/libs/*-all.jar app.jar
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar /otel/agent.jar
# protocollo grpc -> porta 4317 (allineamento corretto protocollo/porta)
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
ENV OTEL_EXPORTER_OTLP_PROTOCOL=grpc
ENV OTEL_SERVICE_NAME=store
# Esporta i tre segnali via OTLP (traces+metrics+logs). L'appender instrumentation
# logback del Java agent trasforma i log applicativi in record OTLP con trace_id.
ENV OTEL_LOGS_EXPORTER=otlp
CMD ["java", "-javaagent:/otel/agent.jar", "-jar", "app.jar"]

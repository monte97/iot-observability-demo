import json, os
from confluent_kafka import Consumer, Producer
from opentelemetry import trace, propagate, context

tracer = trace.get_tracer("normalizer")
broker = os.environ.get("KAFKA_BROKER", "kafka:9092")
consumer = Consumer({"bootstrap.servers": broker, "group.id": "normalizer", "auto.offset.reset": "earliest"})
producer = Producer({"bootstrap.servers": broker})
consumer.subscribe(["telemetry.raw"])

while True:
    msg = consumer.poll(1.0)
    if msg is None or msg.error():
        continue
    carrier = {k: (v.decode() if isinstance(v, bytes) else v) for k, v in (msg.headers() or [])}
    ctx = propagate.extract(carrier)
    with tracer.start_as_current_span("normalize", context=ctx):
        data = json.loads(msg.value())
        data["normalized"] = True
        # span PRODUCER esplicito: confluent-kafka non e' auto-strumentato dal distro,
        # cosi' la produce su telemetry.clean compare come span (e nelle span-metrics).
        with tracer.start_as_current_span(
            "telemetry.clean publish",
            kind=trace.SpanKind.PRODUCER,
            attributes={"messaging.system": "kafka", "messaging.destination.name": "telemetry.clean"},
        ):
            out_headers = {}
            propagate.inject(out_headers)
            producer.produce(
                "telemetry.clean",
                json.dumps(data).encode(),
                headers=[(k, v.encode()) for k, v in out_headers.items()],
            )
            producer.flush()

package demo;
import org.apache.kafka.clients.consumer.*;
import com.mongodb.client.*;
import org.bson.Document;
import java.time.Duration;
import java.util.*;

public class Store {
  public static void main(String[] args) {
    String broker = System.getenv().getOrDefault("KAFKA_BROKER", "kafka:9092");
    Properties p = new Properties();
    p.put("bootstrap.servers", broker);
    p.put("group.id", "store");
    p.put("auto.offset.reset", "earliest");
    p.put("key.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
    p.put("value.deserializer", "org.apache.kafka.common.serialization.StringDeserializer");
    var consumer = new KafkaConsumer<String, String>(p);
    consumer.subscribe(List.of("telemetry.clean"));
    var mongo = MongoClients.create(System.getenv().getOrDefault("MONGO_URL", "mongodb://mongo:27017"));
    var col = mongo.getDatabase("iot").getCollection("telemetry");
    System.out.println("store: consuming telemetry.clean -> mongo");
    while (true) {
      for (var rec : consumer.poll(Duration.ofSeconds(1)))
        col.insertOne(Document.parse(rec.value()));
    }
  }
}

<script setup>
import { ref } from 'vue';
import { send } from '../api';

const deviceId = ref('browser-e2e');
const value = ref(1);
const lastStatus = ref(null);
const lastDevice = ref('');
const sending = ref(false);

async function onSend() {
  sending.value = true;
  lastDevice.value = deviceId.value;
  try {
    lastStatus.value = await send({ device_id: deviceId.value, value: value.value });
  } catch (e) {
    lastStatus.value = `error: ${e.message}`;
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <section>
    <h2>Send telemetry</h2>
    <div class="form">
      <label>device_id <input v-model="deviceId" /></label>
      <label>value <input v-model.number="value" type="number" /></label>
      <button type="button" :disabled="sending" @click="onSend">Send telemetry</button>
    </div>
    <p v-if="lastStatus !== null" class="status">
      status: <strong>{{ lastStatus }}</strong> (device={{ lastDevice }})
    </p>
  </section>
</template>

<style scoped>
.form { display: flex; gap: 1rem; align-items: end; flex-wrap: wrap; margin: 1rem 0; }
label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
input { padding: 0.4rem; border: 1px solid #ccc; border-radius: 4px; }
button { padding: 0.5rem 1rem; cursor: pointer; }
.status { font-family: monospace; }
</style>

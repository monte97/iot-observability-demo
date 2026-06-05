<script setup>
import { store } from '../store';
</script>

<template>
  <section>
    <h2>History</h2>
    <p v-if="!store.sends.length" class="empty">Nessun invio ancora.</p>
    <table v-else>
      <thead>
        <tr><th>ts</th><th>device_id</th><th>status</th></tr>
      </thead>
      <tbody>
        <tr v-for="(s, i) in store.sends" :key="i">
          <td>{{ s.ts }}</td>
          <td>{{ s.device_id }}</td>
          <td>{{ s.status }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
table { border-collapse: collapse; width: 100%; font-family: monospace; font-size: 0.85rem; }
th, td { border: 1px solid #e2e2e2; padding: 0.4rem 0.6rem; text-align: left; }
th { background: #fafafa; }
.empty { color: #777; }
</style>

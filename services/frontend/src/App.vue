<script setup>
import AppHeader from './components/AppHeader.vue';
</script>

<template>
  <AppHeader />
  <main>
    <router-view />
  </main>
</template>

<style>
body { font-family: system-ui, sans-serif; margin: 0; color: #1a1a1a; }
main { padding: 1.5rem; max-width: 720px; margin: 0 auto; }
</style>

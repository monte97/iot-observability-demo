<script setup>
import { auth } from '../auth';
</script>

<template>
  <header>
    <span class="brand">IoT Demo</span>
    <nav>
      <RouterLink to="/">Send</RouterLink>
      <RouterLink to="/history">History</RouterLink>
    </nav>
    <span class="user">
      <template v-if="auth.isAuthenticated">
        {{ auth.user }}
        <button type="button" @click="auth.logout()">sign out</button>
      </template>
      <button v-else type="button" @click="auth.login()">sign in</button>
    </span>
  </header>
</template>

<style scoped>
header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #e2e2e2;
  background: #fafafa;
}
.brand { font-weight: 700; }
nav { display: flex; gap: 1rem; }
nav a { text-decoration: none; color: #2563eb; }
nav a.router-link-active { font-weight: 600; text-decoration: underline; }
.user { margin-left: auto; }
</style>

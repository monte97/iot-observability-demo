import { reactive } from 'vue';

// Stato condiviso minimale (niente Pinia): la lista degli invii per la History.
export const store = reactive({ sends: [] });

export function record(entry) {
  store.sends.unshift(entry);
}

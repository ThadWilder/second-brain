// localStorage-backed stub for expo-secure-store on web
const store = typeof localStorage !== 'undefined' ? localStorage : new Map();
const get = k => (store instanceof Map ? store.get(k) : store.getItem(k)) ?? null;
const set = (k, v) => store instanceof Map ? store.set(k, v) : store.setItem(k, v);
const del = k => store instanceof Map ? store.delete(k) : store.removeItem(k);

module.exports = {
  getItemAsync: async (k) => get(k),
  setItemAsync: async (k, v) => set(k, v),
  deleteItemAsync: async (k) => del(k),
  getValueWithKeyAsync: async (k) => get(k),
  setValueWithKeyAsync: async (k, v) => set(k, v),
  deleteValueWithKeyAsync: async (k) => del(k),
  WHEN_UNLOCKED: 1,
  AFTER_FIRST_UNLOCK: 2,
  ALWAYS: 3,
  default: null, // populated below
};
module.exports.default = module.exports;

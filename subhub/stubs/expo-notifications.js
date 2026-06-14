// No-op stub for expo-notifications on web
const noop = async () => null;
module.exports = {
  getPermissionsAsync: noop,
  requestPermissionsAsync: noop,
  getExpoPushTokenAsync: noop,
  setNotificationHandler: noop,
  addNotificationReceivedListener: () => ({ remove: noop }),
  addNotificationResponseReceivedListener: () => ({ remove: noop }),
  removeNotificationSubscription: noop,
  scheduleNotificationAsync: noop,
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 },
  default: null,
};
module.exports.default = module.exports;

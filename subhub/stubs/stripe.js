// No-op stub for @stripe/stripe-react-native on web
const React = require('react');
const noop = async () => ({});
module.exports = {
  StripeProvider: ({ children }) => children,
  useStripe: () => ({
    confirmPayment: noop,
    initPaymentSheet: noop,
    presentPaymentSheet: noop,
    confirmSetupIntent: noop,
  }),
  default: null,
};
module.exports.default = module.exports;

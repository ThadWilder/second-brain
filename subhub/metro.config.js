const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const stub = (name) => path.resolve(__dirname, `stubs/${name}.js`);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    // Alias top-level react-native → react-native-web
    if (moduleName === 'react-native') {
      return context.resolveRequest(context, 'react-native-web', platform);
    }
    // Alias react-native/* subpath imports → react-native-web equivalents or empty stub
    if (moduleName.startsWith('react-native/')) {
      const subPath = moduleName.slice('react-native/'.length);
      try {
        return context.resolveRequest(context, 'react-native-web/src/' + subPath, platform);
      } catch {
        return { filePath: stub('empty'), type: 'sourceFile' };
      }
    }
    // Stub native-only modules
    if (moduleName === 'expo-secure-store') {
      return { filePath: stub('expo-secure-store'), type: 'sourceFile' };
    }
    if (moduleName === 'expo-notifications') {
      return { filePath: stub('expo-notifications'), type: 'sourceFile' };
    }
    if (moduleName === '@stripe/stripe-react-native') {
      return { filePath: stub('stripe'), type: 'sourceFile' };
    }
  }
  // Stub optional opentelemetry peer dep from supabase-js
  if (moduleName === '@opentelemetry/api') {
    return { filePath: stub('empty'), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

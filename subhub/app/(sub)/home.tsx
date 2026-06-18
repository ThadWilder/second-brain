import { View, Image, StyleSheet, StatusBar, useWindowDimensions } from 'react-native';

export default function SubHomeScreen() {
  const { width, height } = useWindowDimensions();
  // Cap the logo so it doesn't fill the entire screen on mobile; allow it to
  // breathe with dark padding rather than cropping into the image.
  const logoSize = Math.min(width, height, 480);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Image
        source={require('@/assets/logo-hero.jpeg')}
        style={{ width: logoSize, height: logoSize }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0d1117',
  },
});

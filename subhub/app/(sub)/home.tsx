import { View, Image, StyleSheet, StatusBar, useWindowDimensions } from 'react-native';

export default function SubHomeScreen() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Full-bleed brand logo — clean splash; navigate via the sidebar / tabs */}
      <Image
        source={require('@/assets/logo-hero.jpeg')}
        style={{ width, height }}
        resizeMode="cover"
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

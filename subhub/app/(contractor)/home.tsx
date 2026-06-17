import { View, Image, StyleSheet, StatusBar } from 'react-native';

export default function ContractorHomeScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Full-bleed brand logo — clean splash; navigate via the sidebar / tabs */}
      <Image
        source={require('@/assets/logo-hero.jpeg')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
});

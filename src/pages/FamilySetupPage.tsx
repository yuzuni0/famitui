import { StyleSheet, Text, View } from 'react-native';

export default function FamilySetupPage() {
  return (
    <View style={styles.container}>
      <Text>FamilySetupPage</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
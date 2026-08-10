import { StyleSheet, Text, View } from 'react-native';

export default function SignUpPage() {
  return (
    <View style={styles.container}>
      <Text>SignUpPage</Text>
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
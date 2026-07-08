import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Updates from 'expo-updates';

export default function OTACheckScreen({ onDone }: { onDone: () => void }) {
  const [message, setMessage] = useState('Loading...');
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Hard timeout: bail after 5 seconds no matter what
      const timeout = setTimeout(() => {
        if (!cancelled) {
          cancelled = true;
          onDone();
        }
      }, 5000);

      try {
        setMessage('Checking for updates...');
        const checkResult = await Updates.checkForUpdateAsync();
        if (cancelled) return;

        if (!checkResult.isAvailable) {
          clearTimeout(timeout);
          if (!cancelled) onDone();
          return;
        }

        setMessage('Applying update...');
        const fetchResult = await Updates.fetchUpdateAsync();
        if (cancelled) return;

        clearTimeout(timeout);

        if (fetchResult.isNew) {
          setMessage('Update ready!');
          await new Promise(r => setTimeout(r, 500));
          if (!cancelled) {
            await Updates.reloadAsync();
          }
        } else {
          if (!cancelled) onDone();
        }
      } catch {
        clearTimeout(timeout);
        if (!cancelled) onDone();
      }
    };

    run();

    return () => { cancelled = true; };
  }, [onDone]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ai-wardrobe</Text>
      <ActivityIndicator size="large" color="#007AFF" style={styles.spinner} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  spinner: {
    marginBottom: 20,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

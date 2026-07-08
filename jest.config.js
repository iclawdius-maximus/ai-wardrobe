module.exports = {
  preset: 'jest-expo',
  testTimeout: 30000,
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|@react-native-async-storage|@react-native-community|expo(nent)?|@expo(nent)?/.*|react-native.*|@react-native/.*|expo-modules-core|expo-status-bar|expo-secure-store|expo-image-picker|expo-file-system|expo-camera|expo-av|@supabase|@react-native-async-storage)/'
  ],
  setupFiles: ['<rootDir>/jest.env.js'],
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect', '<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.expo/'],
};

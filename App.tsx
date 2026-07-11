import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import LoginScreen from './app/auth/LoginScreen';
import SignUpScreen from './app/auth/SignUpScreen';
import WardrobeScreen from './app/tabs/WardrobeScreen';
import OutfitBuilderScreen from './app/tabs/OutfitBuilderScreen';
import ProfileScreen from './app/tabs/ProfileScreen';
import GarmentUploadScreen from './app/wardrobe/GarmentUploadScreen';
import GarmentDetailScreen from './app/wardrobe/GarmentDetailScreen';
import RenderResultScreen from './app/outfit/RenderResultScreen';
import { AuthProvider, useAuth } from './lib/authContext';

const Tab = createBottomTabNavigator();

function TabIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}

function TabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen 
        name="Wardrobe" 
        component={WardrobeScreen} 
        options={{ 
          tabBarLabel: 'Wardrobe',
          tabBarIcon: () => <TabIcon emoji="👕" />
        }} 
      />
      <Tab.Screen 
        name="Outfits" 
        component={OutfitBuilderScreen} 
        options={{ 
          tabBarLabel: 'Outfits',
          tabBarIcon: () => <TabIcon emoji="✨" />
        }} 
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen} 
        options={{ 
          tabBarLabel: 'Profile',
          tabBarIcon: () => <TabIcon emoji="👤" />
        }} 
      />
    </Tab.Navigator>
  );
}

const Stack = createNativeStackNavigator();

function AuthStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="MainTabs" 
        component={TabNavigator} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen name="GarmentUpload" component={GarmentUploadScreen} />
      <Stack.Screen name="GarmentDetail" component={GarmentDetailScreen} />
      <Stack.Screen name="RenderResult" component={RenderResultScreen} />
    </Stack.Navigator>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }

  return (
    <NavigationContainer>
      {session ? (
        <MainStack />
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { User, ShieldCheck, Bell, LogOut, ChevronRight, Settings } from 'lucide-react-native';

const MENU_ITEMS = [
  { id: 'account', label: 'Account Settings', icon: Settings },
  { id: 'privacy', label: 'Privacy & Data', icon: ShieldCheck },
  { id: 'notifications', label: 'Notification Preferences', icon: Bell },
];

export default function ProfileScreen() {
  return (
    <ScrollView className="flex-1 bg-slate-50">
      <View className="px-5 pt-14 pb-6 bg-white border-b border-slate-100 items-center">
        <View className="w-20 h-20 rounded-full bg-blue-900 items-center justify-center">
          <User size={32} color="#FFFFFF" />
        </View>
        <Text className="text-slate-900 text-xl font-bold mt-3">Juan Dela Cruz</Text>
        <Text className="text-slate-400 text-xs mt-1">juan.delacruz@email.com</Text>
      </View>

      <View className="px-5 mt-5">
        {MENU_ITEMS.map(({ id, label, icon: Icon }) => (
          <Pressable
            key={id}
            className="flex-row items-center justify-between bg-white border border-slate-100 rounded-2xl px-4 py-4 mb-3 active:opacity-80"
          >
            <View className="flex-row items-center">
              <Icon size={18} color="#1E3A8A" />
              <Text className="text-slate-800 text-sm font-medium ml-3">{label}</Text>
            </View>
            <ChevronRight size={18} color="#CBD5E1" />
          </Pressable>
        ))}

        <Pressable className="flex-row items-center justify-center bg-red-50 border border-red-100 rounded-2xl px-4 py-4 mt-4 active:opacity-80">
          <LogOut size={18} color="#DC2626" />
          <Text className="text-red-600 text-sm font-semibold ml-2">Log Out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
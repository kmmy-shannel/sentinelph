import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Search as SearchIcon, ShieldAlert, ShieldCheck } from 'lucide-react-native';
import { fetchBlacklistStatus } from '../services/api';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await fetchBlacklistStatus(trimmed);
      setResult(data);
    } catch (err) {
      setError('Unable to check this number right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-5 pt-14 pb-4 bg-white border-b border-slate-100">
        <Text className="text-slate-900 text-2xl font-bold">Search Registry</Text>
        <Text className="text-slate-400 text-xs mt-1">
          Check if a phone number has been flagged for scam activity.
        </Text>
      </View>

      <View className="px-5 pt-5">
        <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl px-4">
          <SearchIcon size={18} color="#94A3B8" />
          <TextInput
            className="flex-1 py-3.5 ml-2 text-slate-900"
            placeholder="Enter phone number"
            placeholderTextColor="#CBD5E1"
            keyboardType="phone-pad"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
        </View>
        <Pressable
          onPress={handleSearch}
          disabled={loading}
          className="bg-blue-900 rounded-2xl py-3.5 items-center mt-3 active:opacity-90"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-sm">Check Number</Text>
          )}
        </Pressable>
      </View>

      <ScrollView className="px-5 mt-5">
        {error && (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        )}

        {result && (
          <View className={`rounded-2xl p-5 ${result.flagged ? 'bg-red-600' : 'bg-emerald-600'}`}>
            <View className="flex-row items-center">
              {result.flagged ? (
                <ShieldAlert size={22} color="#FFFFFF" />
              ) : (
                <ShieldCheck size={22} color="#FFFFFF" />
              )}
              <Text className="text-white font-bold text-base ml-2">
                {result.flagged ? 'Flagged Number' : 'No Reports Found'}
              </Text>
            </View>
            <Text className="text-white/90 text-xs mt-2 leading-4">
              {result.flagged
                ? `This number has ${result.reportCount || 'multiple'} report(s) linked to scam activity.`
                : 'No reports have been filed against this number yet.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
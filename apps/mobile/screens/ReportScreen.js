import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Phone,
  MessageSquareText,
  Camera,
  Image as ImageIcon,
  MapPin,
  X,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Send,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { submitReport } from '../services/api';
import { enqueueReport } from '../db/sqlite';

const TOTAL_STEPS = 3;

const initialFormState = {
  reportedNumber: '',
  description: '',
  evidence: [],
  location: null,
  locationLabel: null,
};

export default function ReportScreen() {
  const navigation = useNavigation();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState({});

  const resetWizard = useCallback(() => {
    setForm(initialFormState);
    setStep(1);
    setErrors({});
  }, []);

  const validateStep1 = () => {
    const nextErrors = {};
    const digitsOnly = form.reportedNumber.replace(/[^0-9+]/g, '');
    if (!digitsOnly || digitsOnly.length < 7) {
      nextErrors.reportedNumber = 'Enter a valid phone number.';
    }
    if (!form.description.trim() || form.description.trim().length < 10) {
      nextErrors.description = 'Please describe the incident (min. 10 characters).';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    setStep((current) => Math.min(current + 1, TOTAL_STEPS));
  };

  const goBack = () => {
    setStep((current) => Math.max(current - 1, 1));
  };

  const pickEvidence = async (source) => {
    try {
      let permissionResult;
      if (source === 'camera') {
        permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }

      if (!permissionResult.granted) {
        Alert.alert(
          'Permission required',
          `SentinelPH needs ${source === 'camera' ? 'camera' : 'photo library'} access to attach evidence.`
        );
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false })
          : await ImagePicker.launchImageLibraryAsync({
              quality: 0.6,
              allowsEditing: false,
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const evidenceItem = {
        uri: asset.uri,
        fileName: asset.fileName || `evidence_${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        fileSize: asset.fileSize || null,
        capturedAt: new Date().toISOString(),
      };

      setForm((prev) => ({ ...prev, evidence: [...prev.evidence, evidenceItem] }));
    } catch (error) {
      Alert.alert('Attachment failed', error.message || 'Could not capture evidence.');
    }
  };

  const removeEvidence = (uri) => {
    setForm((prev) => ({
      ...prev,
      evidence: prev.evidence.filter((item) => item.uri !== uri),
    }));
  };

  const captureLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Location access helps map scam hotspots near you.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const [place] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      const label = place
        ? [place.street, place.city || place.subregion, place.region].filter(Boolean).join(', ')
        : `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;

      setForm((prev) => ({
        ...prev,
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        locationLabel: label,
      }));
    } catch (error) {
      Alert.alert('Location unavailable', error.message || 'Could not fetch current location.');
    } finally {
      setLocating(false);
    }
  };

  const buildPayload = () => ({
    localUuid: `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    reportedNumber: form.reportedNumber.trim(),
    description: form.description.trim(),
    evidence: form.evidence,
    location: form.location,
    locationLabel: form.locationLabel,
    submittedAt: new Date().toISOString(),
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    const payload = buildPayload();

    try {
      const netState = await NetInfo.fetch();
      const isConnected = netState.isConnected && netState.isInternetReachable !== false;

      if (!isConnected) {
        throw new Error('OFFLINE');
      }

      await submitReport(payload);

      Alert.alert(
        'Report submitted',
        'Thank you. Your report has been received and will be reviewed by our team.',
        [
          {
            text: 'OK',
            onPress: () => {
              resetWizard();
              navigation.navigate('Home');
            },
          },
        ]
      );
    } catch (error) {
      // Network failure, timeout, or offline device -> fall back to local queue
      try {
        await enqueueReport(payload);
        Alert.alert(
          'Saved offline',
          "You're offline or the server is unreachable. Your report was saved on this device and will be submitted automatically once you're back online.",
          [
            {
              text: 'OK',
              onPress: () => {
                resetWizard();
                navigation.navigate('Home');
              },
            },
          ]
        );
      } catch (queueError) {
        Alert.alert(
          'Submission failed',
          `We could not submit or save your report: ${queueError.message}`
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-5 pt-14 pb-4 bg-white border-b border-slate-100">
        <Text className="text-slate-900 text-2xl font-bold">Report a Scam</Text>
        <Text className="text-slate-400 text-xs mt-1">
          Step {step} of {TOTAL_STEPS}
        </Text>
        <View className="flex-row mt-3">
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              className={`flex-1 h-1.5 rounded-full mr-1.5 ${
                s <= step ? 'bg-blue-900' : 'bg-slate-200'
              }`}
            />
          ))}
        </View>
      </View>

      <ScrollView className="flex-1 px-5 pt-5" contentContainerStyle={{ paddingBottom: 24 }}>
        {step === 1 && (
          <View>
            <Text className="text-slate-900 font-bold text-base mb-1">Incident Details</Text>
            <Text className="text-slate-400 text-xs mb-5">
              Tell us who contacted you and what happened.
            </Text>

            <Text className="text-slate-700 text-sm font-semibold mb-2">Reported Phone Number</Text>
            <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl px-4 mb-1">
              <Phone size={18} color="#94A3B8" />
              <TextInput
                className="flex-1 py-3.5 ml-2 text-slate-900"
                placeholder="e.g. +63 917 123 4567"
                placeholderTextColor="#CBD5E1"
                keyboardType="phone-pad"
                value={form.reportedNumber}
                onChangeText={(text) => setForm((prev) => ({ ...prev, reportedNumber: text }))}
              />
            </View>
            {errors.reportedNumber ? (
              <Text className="text-red-500 text-xs mb-3">{errors.reportedNumber}</Text>
            ) : (
              <View className="mb-3" />
            )}

            <Text className="text-slate-700 text-sm font-semibold mb-2">What happened?</Text>
            <View className="flex-row bg-white border border-slate-200 rounded-2xl px-4 py-3.5">
              <MessageSquareText size={18} color="#94A3B8" />
              <TextInput
                className="flex-1 ml-2 text-slate-900"
                placeholder="Describe the call, SMS, or message you received..."
                placeholderTextColor="#CBD5E1"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                style={{ minHeight: 110 }}
                value={form.description}
                onChangeText={(text) => setForm((prev) => ({ ...prev, description: text }))}
              />
            </View>
            {errors.description ? (
              <Text className="text-red-500 text-xs mt-1">{errors.description}</Text>
            ) : null}
          </View>
        )}

        {step === 2 && (
          <View>
            <Text className="text-slate-900 font-bold text-base mb-1">Evidence & Location</Text>
            <Text className="text-slate-400 text-xs mb-5">
              Attach screenshots and share your location to help authorities map scam hotspots.
            </Text>

            <Text className="text-slate-700 text-sm font-semibold mb-2">Evidence</Text>
            <View className="flex-row mb-3">
              <Pressable
                onPress={() => pickEvidence('camera')}
                className="flex-1 flex-row items-center justify-center bg-white border border-slate-200 rounded-2xl py-3.5 mr-2 active:opacity-80"
              >
                <Camera size={18} color="#1E3A8A" />
                <Text className="text-blue-900 font-semibold text-sm ml-2">Camera</Text>
              </Pressable>
              <Pressable
                onPress={() => pickEvidence('library')}
                className="flex-1 flex-row items-center justify-center bg-white border border-slate-200 rounded-2xl py-3.5 ml-2 active:opacity-80"
              >
                <ImageIcon size={18} color="#1E3A8A" />
                <Text className="text-blue-900 font-semibold text-sm ml-2">Gallery</Text>
              </Pressable>
            </View>

            {form.evidence.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
                {form.evidence.map((item) => (
                  <View key={item.uri} className="mr-3 relative">
                    <Image
                      source={{ uri: item.uri }}
                      className="w-20 h-20 rounded-xl bg-slate-200"
                    />
                    <Pressable
                      onPress={() => removeEvidence(item.uri)}
                      className="absolute -top-2 -right-2 bg-red-600 rounded-full p-1"
                    >
                      <X size={12} color="#FFFFFF" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            <Text className="text-slate-700 text-sm font-semibold mb-2">Location</Text>
            <Pressable
              onPress={captureLocation}
              className="flex-row items-center justify-between bg-white border border-slate-200 rounded-2xl px-4 py-3.5 active:opacity-80"
            >
              <View className="flex-row items-center flex-1 pr-2">
                <MapPin size={18} color={form.location ? '#059669' : '#94A3B8'} />
                <Text
                  className={`ml-2 text-sm flex-1 ${
                    form.location ? 'text-slate-900' : 'text-slate-400'
                  }`}
                  numberOfLines={2}
                >
                  {form.locationLabel || 'Tap to attach your current location'}
                </Text>
              </View>
              {locating ? (
                <ActivityIndicator size="small" color="#1E3A8A" />
              ) : form.location ? (
                <CheckCircle2 size={18} color="#059669" />
              ) : null}
            </Pressable>
            <Text className="text-slate-300 text-[11px] mt-2">
              Location is optional but helps improve nearby scam alerts for your community.
            </Text>
          </View>
        )}

        {step === 3 && (
          <View>
            <Text className="text-slate-900 font-bold text-base mb-1">Review & Submit</Text>
            <Text className="text-slate-400 text-xs mb-5">
              Please confirm the details below before submitting your report.
            </Text>

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
              <Text className="text-slate-400 text-[11px] uppercase font-semibold">
                Reported Number
              </Text>
              <Text className="text-slate-900 text-sm font-semibold mt-1">
                {form.reportedNumber || '—'}
              </Text>
            </View>

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
              <Text className="text-slate-400 text-[11px] uppercase font-semibold">
                Description
              </Text>
              <Text className="text-slate-900 text-sm mt-1 leading-5">
                {form.description || '—'}
              </Text>
            </View>

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
              <Text className="text-slate-400 text-[11px] uppercase font-semibold">
                Evidence Attached
              </Text>
              <Text className="text-slate-900 text-sm mt-1">
                {form.evidence.length} file{form.evidence.length === 1 ? '' : 's'}
              </Text>
            </View>

            <View className="bg-white border border-slate-200 rounded-2xl p-4 mb-5">
              <Text className="text-slate-400 text-[11px] uppercase font-semibold">Location</Text>
              <Text className="text-slate-900 text-sm mt-1">
                {form.locationLabel || 'Not attached'}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View className="flex-row px-5 py-4 bg-white border-t border-slate-100">
        {step > 1 && (
          <Pressable
            onPress={goBack}
            disabled={submitting}
            className="flex-row items-center justify-center bg-slate-100 rounded-2xl px-5 py-3.5 mr-3"
          >
            <ChevronLeft size={18} color="#334155" />
            <Text className="text-slate-700 font-semibold text-sm ml-1">Back</Text>
          </Pressable>
        )}

        {step < TOTAL_STEPS ? (
          <Pressable
            onPress={goNext}
            className="flex-1 flex-row items-center justify-center bg-blue-900 rounded-2xl py-3.5 active:opacity-90"
          >
            <Text className="text-white font-bold text-sm mr-1">Continue</Text>
            <ChevronRight size={18} color="#FFFFFF" />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            className="flex-1 flex-row items-center justify-center bg-emerald-600 rounded-2xl py-3.5 active:opacity-90"
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Send size={18} color="#FFFFFF" />
                <Text className="text-white font-bold text-sm ml-2">Submit Report</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
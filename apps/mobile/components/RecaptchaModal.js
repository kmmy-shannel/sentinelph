// apps/mobile/components/RecaptchaModal.js
//
// Replacement for the unmaintained `expo-firebase-recaptcha` package.
// Implements Firebase's `ApplicationVerifier` interface
// ({ type: string, verify(): Promise<string> }) ourselves using a plain
// `react-native-webview`, so PhoneAuthProvider.verifyPhoneNumber() can use
// it directly — no native modules, works in Expo Go and dev clients alike.
//
// How it works:
//   1. verify() opens the modal and resolves a pending Promise.
//   2. The WebView loads a minimal HTML page (built below) that pulls in
//      Firebase's *web* compat SDK from a CDN and renders an invisible
//      reCAPTCHA widget scoped to your Firebase project.
//   3. On success, the page calls
//      `window.ReactNativeWebView.postMessage(...)` with the resulting
//      token; on failure/expiry it posts an error payload instead.
//   4. onMessage parses that payload and resolves/rejects the pending
//      Promise, then closes the modal.
//
// Most of the time this resolves silently within ~1-2s and the modal is
// barely visible. If Google's reCAPTCHA decides the request looks
// suspicious, it renders a visible challenge inside the WebView — the
// modal stays open so the user can complete it, exactly like the
// abandoned library used to behave.

import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

function buildRecaptchaHtml(firebaseConfig) {
  // Pin to a specific compat SDK version so behavior doesn't shift under
  // you — bump deliberately, independent of your installed `firebase` npm
  // package version (this only talks to Firebase's own verification
  // endpoints, not your app bundle).
  const SDK_VERSION = '10.12.2';

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      #recaptcha-container { display: flex; align-items: center; justify-content: center; padding-top: 24px; }
    </style>
  </head>
  <body>
    <div id="recaptcha-container"></div>
    <script src="https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth-compat.js"></script>
    <script>
      function post(payload) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      try {
        firebase.initializeApp(${JSON.stringify(firebaseConfig)});

        var verifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
          size: 'invisible',
          callback: function (token) {
            post({ type: 'success', token: token });
          },
          'expired-callback': function () {
            post({ type: 'expired' });
          },
        }, firebase.auth());

        verifier.render()
          .then(function () {
            return verifier.verify();
          })
          .then(function (token) {
            post({ type: 'success', token: token });
          })
          .catch(function (err) {
            post({ type: 'error', message: err && err.message ? err.message : 'Verification failed' });
          });
      } catch (err) {
        post({ type: 'error', message: err && err.message ? err.message : 'Failed to initialize verifier' });
      }
    </script>
  </body>
</html>
  `;
}

const RecaptchaModal = forwardRef(function RecaptchaModal({ firebaseConfig }, ref) {
  const [visible, setVisible] = useState(false);
  const pendingRef = useRef(null); // { resolve, reject }

  const settle = useCallback((fn, arg) => {
    if (pendingRef.current) {
      const { resolve, reject } = pendingRef.current;
      pendingRef.current = null;
      setVisible(false);
      fn === 'resolve' ? resolve(arg) : reject(arg);
    }
  }, []);

  const handleMessage = useCallback(
    (event) => {
      let payload;
      try {
        payload = JSON.parse(event.nativeEvent.data);
      } catch {
        settle('reject', new Error('Malformed verification response.'));
        return;
      }

      if (payload.type === 'success' && payload.token) {
        settle('resolve', payload.token);
      } else if (payload.type === 'expired') {
        settle('reject', new Error('Verification expired — please try again.'));
      } else {
        settle('reject', new Error(payload.message || 'Verification failed.'));
      }
    },
    [settle]
  );

  const handleCancel = useCallback(() => {
    settle('reject', new Error('Verification cancelled.'));
  }, [settle]);

  const handleWebViewError = useCallback(() => {
    settle('reject', new Error('Could not load verification — check your connection.'));
  }, [settle]);

  // Exposes the Firebase ApplicationVerifier shape. This ref itself is
  // passed directly as the `applicationVerifier` argument to
  // PhoneAuthProvider.verifyPhoneNumber().
  useImperativeHandle(ref, () => ({
    type: 'recaptcha',
    verify: () =>
      new Promise((resolve, reject) => {
        if (pendingRef.current) {
          reject(new Error('A verification is already in progress.'));
          return;
        }
        pendingRef.current = { resolve, reject };
        setVisible(true);
      }),
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(9,9,15,0.85)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 340,
            borderRadius: 16,
            backgroundColor: '#0d0d14',
            borderWidth: 1,
            borderColor: '#1e1e30',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#1e1e30',
            }}
          >
            <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '600' }}>
              Verifying you&apos;re human
            </Text>
            <TouchableOpacity onPress={handleCancel}>
              <Text style={{ color: '#6b7280', fontSize: 13 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={{ minHeight: 220, alignItems: 'center', justifyContent: 'center' }}>
            {visible && (
              <WebView
                originWhitelist={['*']}
                source={{ html: buildRecaptchaHtml(firebaseConfig) }}
                onMessage={handleMessage}
                onError={handleWebViewError}
                onHttpError={handleWebViewError}
                javaScriptEnabled
                domStorageEnabled
                style={{ width: '100%', height: 220, backgroundColor: 'transparent' }}
                startInLoadingState
                renderLoading={() => (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color="#22c55e" />
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
});

export default RecaptchaModal;
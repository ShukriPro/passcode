import { Platform, StyleSheet, View, Text, TouchableOpacity, Vibration, AppState, Alert, Linking } from 'react-native';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Slot } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const PASSCODE_KEY = 'passcode_4digit_v1';
const RELock_AFTER_SECONDS = 30;

const KEYS = [
  { num: '1', sub: '' },
  { num: '2', sub: 'ABC' },
  { num: '3', sub: 'DEF' },
  { num: '4', sub: 'GHI' },
  { num: '5', sub: 'JKL' },
  { num: '6', sub: 'MNO' },
  { num: '7', sub: 'PQRS' },
  { num: '8', sub: 'TUV' },
  { num: '9', sub: 'WXYZ' },
  { num: 'bio', sub: '' },
  { num: '0', sub: '+' },
  { num: 'del', sub: '' },
];

type Status = 'idle' | 'error' | 'success';

export default function PasscodeScreen() {
  const appState = useRef(AppState.currentState);
  const backgroundedAtMs = useRef<number | null>(null);

  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('');
  const [pressing, setPressing] = useState<string | null>(null);

  const [unlocked, setUnlocked] = useState(false);
  const [storedPasscode, setStoredPasscode] = useState<string | null>(null);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [bioInFlight, setBioInFlight] = useState(false);

  const mode = useMemo<'create' | 'enter'>(() => (storedPasscode ? 'enter' : 'create'), [storedPasscode]);

  const reset = useCallback(() => {
    setInput('');
    setStatus('idle');
    setLocked(false);
    setMessage('');
  }, []);

  const doUnlock = useCallback((successMessage?: string) => {
    setUnlocked(true);
    setStatus('success');
    setMessage(successMessage ?? 'Unlocked');
    setLocked(true);
    setTimeout(() => {
      reset();
      setMessage('');
      setStatus('idle');
    }, 600);
  }, [reset]);

  const doLock = useCallback(() => {
    setUnlocked(false);
    reset();
  }, [reset]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const code = await AsyncStorage.getItem(PASSCODE_KEY);
        if (!mounted) return;
        setStoredPasscode(code);
      } catch {
        // ignore (we'll fall back to create mode)
      }

      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (!mounted) return;
        setBiometricSupported(Boolean(hasHardware && types.length > 0));
      } catch {
        if (!mounted) return;
        setBiometricSupported(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const keysToRender = useMemo(() => {
    if (!biometricSupported) return KEYS.filter(k => k.num !== 'bio');
    return KEYS;
  }, [biometricSupported]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      const prev = appState.current;
      appState.current = nextState;

      if (prev.match(/active/) && nextState.match(/inactive|background/)) {
        backgroundedAtMs.current = Date.now();
        return;
      }

      if (prev.match(/inactive|background/) && nextState === 'active') {
        const bgAt = backgroundedAtMs.current;
        backgroundedAtMs.current = null;
        if (!bgAt) return;
        const seconds = (Date.now() - bgAt) / 1000;
        if (seconds >= RELock_AFTER_SECONDS) doLock();
      }
    });

    return () => sub.remove();
  }, [doLock]);

  const openFaceIdSettings = useCallback(() => {
    Alert.alert(
      'Enable Face ID',
      'Face ID is disabled for this app. Please enable it in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]
    );
  }, []);

  const tryBiometric = useCallback(async () => {
    if (bioInFlight) return;
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      openFaceIdSettings();
      return;
    }
    setBioInFlight(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock',
        cancelLabel: 'Cancel',
        fallbackLabel: '',
        disableDeviceFallback: true,
      });
      if (result.success) {
        doUnlock('Unlocked');
        return;
      }
      if (
        result.error === 'not_available' ||
        result.error === 'not_enrolled' ||
        result.error === 'lockout'
      ) {
        openFaceIdSettings();
        return;
      }
      setStatus('error');
      setMessage('Try again');
      setTimeout(() => {
        setMessage('');
        setStatus('idle');
      }, 900);
    } catch {
      openFaceIdSettings();
    } finally {
      setBioInFlight(false);
    }
  }, [bioInFlight, doUnlock, openFaceIdSettings]);

  const check = useCallback(async (code: string) => {
    if (mode === 'create') {
      try {
        await AsyncStorage.setItem(PASSCODE_KEY, code);
        setStoredPasscode(code);
        doUnlock('Passcode set');
      } catch {
        setStatus('error');
        setMessage('Could not save');
        setLocked(true);
        if (Platform.OS !== 'web') Vibration.vibrate([0, 50, 50, 50]);
        setTimeout(reset, 1000);
      }
      return;
    }

    if (code === storedPasscode) {
      doUnlock('Unlocked');
    } else {
      setStatus('error');
      setMessage('Incorrect passcode');
      setLocked(true);
      if (Platform.OS !== 'web') Vibration.vibrate([0, 50, 50, 50]);
      setTimeout(reset, 1000);
    }
  }, [doUnlock, mode, reset, storedPasscode]);

  const press = useCallback((n: string) => {
    if (locked) return;
    if (n === 'del') {
      setInput(prev => prev.slice(0, -1));
      return;
    }
    if (n === 'bio') {
      void tryBiometric();
      return;
    }
    setInput(prev => {
      if (prev.length >= 4) return prev;
      const next = prev + n;
      if (next.length === 4) setTimeout(() => check(next), 120);
      return next;
    });
  }, [locked, check, tryBiometric]);

  const handlePress = (key: string) => {
    setPressing(key);
    setTimeout(() => setPressing(null), 120);
    press(key);
  };

  const dotColor = (i: number) => {
    if (status === 'error') return '#E24B4A';
    if (status === 'success') return '#639922';
    return i < input.length ? '#1a1a1a' : 'transparent';
  };

  const dotBorder = (i: number) => {
    if (status === 'error') return '#E24B4A';
    if (status === 'success') return '#639922';
    return i < input.length ? '#1a1a1a' : '#bbb';
  };

  if (unlocked) {
    return <Slot />;
  }

  return (
    <View style={styles.container}>
      {/* Lock icon */}
      <View style={styles.lockCircle}>
        <Ionicons
          name={status === 'success' ? 'lock-open-outline' : 'lock-closed-outline'}
          size={24}
          color={status === 'success' ? '#3B6D11' : status === 'error' ? '#A32D2D' : '#888'}
        />
      </View>

      <Text style={styles.label}>{mode === 'create' ? 'Create Passcode' : 'Enter Passcode'}</Text>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {[0, 1, 2, 3].map(i => (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: dotColor(i), borderColor: dotBorder(i) }]}
          />
        ))}
      </View>

      {/* Message */}
      <Text style={[
        styles.message,
        status === 'error' && styles.messageError,
        status === 'success' && styles.messageSuccess,
      ]}>
        {message || ' '}
      </Text>

      {/* Keypad */}
      <View style={styles.grid}>
        {keysToRender.map(({ num, sub }) => {
          const isSpecial = num === 'bio' || num === 'del';
          const isPressed = pressing === num;
          return (
            <TouchableOpacity
              key={num}
              style={[
                styles.keyBtn,
                isSpecial && styles.keyBtnSpecial,
                isPressed && styles.keyBtnPressed,
              ]}
              onPress={() => handlePress(num)}
              activeOpacity={0.7}
            >
              {num === 'del' ? (
                <Text style={styles.keySpecialText}>⌫</Text>
              ) : num === 'bio' ? (
                <Ionicons name="finger-print" size={22} color="#888" />
              ) : (
                <>
                  <Text style={styles.keyNum}>{num}</Text>
                  {sub ? <Text style={styles.keySub}>{sub}</Text> : null}
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f7f4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  lockCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#888',
    marginBottom: 24,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  message: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'transparent',
    height: 18,
    marginBottom: 24,
  },
  messageError: {
    color: '#A32D2D',
  },
  messageSuccess: {
    color: '#3B6D11',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    gap: 10,
  },
  keyBtn: {
    width: '30%',
    flexGrow: 1,
    height: 62,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBtnSpecial: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  keyBtnPressed: {
    transform: [{ scale: 0.93 }],
    backgroundColor: '#e8e8e8',
  },
  keyNum: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: 26,
  },
  keySub: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#aaa',
    textTransform: 'uppercase',
  },
  keySpecialText: {
    fontSize: 20,
    color: '#888',
  },
});
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Fonts, useTheme, type AppColorsType } from '../theme';

interface Props {
  children: React.ReactNode;
  colors: AppColorsType;
}

interface State {
  error: Error | null;
}

// Without this, any uncaught render error (a bad message shape, a null
// dereference in a component) white-screens the whole app with no way back
// in short of a force-quit. This catches it and offers a reset instead.
// Class component because React error boundaries have no hook equivalent —
// theme colors come in as a prop from the functional wrapper below instead
// of calling useTheme() directly.
class ErrorBoundaryClass extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] caught:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const styles = createStyles(this.props.colors);
      return (
        <View style={styles.container}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error.message || 'An unexpected error occurred.'}
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.reset} activeOpacity={0.85}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colors } = useTheme();
  return <ErrorBoundaryClass colors={colors}>{children}</ErrorBoundaryClass>;
};

const createStyles = (colors: AppColorsType) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  icon: {
    fontSize: 44,
    marginBottom: 16,
  },
  title: {
    fontFamily: Fonts.satoshi,
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  button: {
    backgroundColor: colors.accentCyan,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Divider, IconButton, InputAdornment, Link, Alert
} from '@mui/material';
import { Eye, EyeOff, ArrowLeft, Google } from 'lucide-react';
import { AppLogo } from '../AppLogo';
import { supabase, isSupabaseConfigured } from '../../storage/supabaseClient';

interface AuthPageProps {
  onBack: () => void;
  onSuccess?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onBack, onSuccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form validation: button is enabled only when required fields are filled
  const isFormValid = () => {
    if (isSignUp) {
      return fullName.trim() !== '' && email.trim() !== '' && password.length >= 6;
    }
    return email.trim() !== '' && password.trim() !== '';
  };

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        });
        if (signupError) throw signupError;
      } else {
        const { error: signinError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signinError) throw signinError;
      }
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Reset loading state when switching between Sign In and Sign Up
  const toggleSignUp = () => {
    setIsSignUp(!isSignUp);
    setLoading(false);
    setError(null);
  };

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        bgcolor: 'background.default',
        color: 'text.primary',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        position: 'relative',
      }}
    >
      {/* Back button */}
      <Button
        startIcon={<ArrowLeft size={18} />}
        onClick={onBack}
        sx={{
          position: 'absolute',
          top: 24,
          left: 24,
          textTransform: 'none',
          color: 'text.secondary',
          fontWeight: 600,
        }}
      >
        Back to App
      </Button>

      {/* Main Auth Card */}
      <Card
        sx={{
          maxWidth: 440,
          width: '100%',
          borderRadius: 4,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)',
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'visible',
          bgcolor: 'background.paper',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Logo and Tagline */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <AppLogo size={48} showText={false} />
            <Typography variant="h5" sx={{ fontWeight: 800, mt: 2, color: 'text.primary' }}>
              {isSignUp ? 'Create your account' : 'Welcome back to NohomeWork'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, textAlign: 'center' }}>
              {isSignUp
                ? 'Start taking beautiful handwriting notes anywhere'
                : 'Sign in to access and sync your notes across devices'}
            </Typography>
          </Box>

          {/* Error alert */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* Google Sign-In Button */}
          <Button
            fullWidth
            variant="outlined"
            onClick={handleGoogleSignIn}
            disabled={loading}
            sx={{
              py: 1.2,
              borderRadius: 2.5,
              textTransform: 'none',
              borderColor: 'divider',
              color: 'text.primary',
              fontWeight: 600,
              display: 'flex',
              gap: 1.5,
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
          >
            Continue with Google
          </Button>

          <Box sx={{ display: 'flex', alignItems: 'center', my: 2.5 }}>
            <Divider sx={{ flex: 1 }} />
            <Typography variant="caption" sx={{ px: 2, color: 'text.secondary', fontWeight: 600 }}>
              OR
            </Typography>
            <Divider sx={{ flex: 1 }} />
          </Box>

          {/* Form */}
          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {isSignUp && (
              <TextField
                fullWidth
                size="small"
                label="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                InputLabelProps={{ shrink: true }}
              />
            )}

            <TextField
              fullWidth
              size="small"
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              fullWidth
              size="small"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
              InputLabelProps={{ shrink: true }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading || !isFormValid()}
              sx={{
                mt: 1,
                py: 1.2,
                borderRadius: 2.5,
                bgcolor: '#2563eb',
                color: '#fff',
                fontWeight: 600,
                textTransform: 'none',
                boxShadow: 'none',
                '&:hover': { bgcolor: '#1d4ed8', boxShadow: 'none' },
                '&.Mui-disabled': {
                  bgcolor: '#475569',
                  color: '#94a3b8',
                },
              }}
            >
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
          </Box>

          {/* Toggle between Sign In and Sign Up */}
          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {isSignUp ? 'Already have an account?' : "Don't have an account yet?"}{' '}
              <Link
                component="button"
                type="button"
                onClick={toggleSignUp}
                sx={{
                  fontWeight: 600,
                  color: '#2563eb',
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Link>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
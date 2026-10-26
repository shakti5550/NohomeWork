import React, { useState, useEffect } from 'react';
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  MenuList,
  Divider,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  InputAdornment,
  IconButton as MuiIconButton,
  Avatar,
  Alert
} from '@mui/material';
import {
  User, Edit, Lock, Calendar, LogOut, Eye, EyeOff, Sun, Moon
} from 'lucide-react';
import { supabase } from '../../storage/supabaseClient';

interface ProfileDropdownProps {
  onSignOut: () => void;
  mode?: 'light' | 'dark';
  toggleTheme?: () => void;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ onSignOut, mode, toggleTheme }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Dialog states — a single "Edit Profile" dialog covers name, email,
  // date of birth and password change together.
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  // Form states
  const [editName, setEditName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [dob, setDob] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch user on mount
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        setEditName(user.user_metadata?.full_name || user.email?.split('@')[0] || '');
        setDob(user.user_metadata?.dob || '');
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setError(null);
    setSuccess(null);
  };

  const handleEditProfileClick = () => {
    handleMenuClose();
    setError(null);
    setSuccess(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setEditProfileOpen(true);
  };

  const handleSignOutClick = () => {
    handleMenuClose();
    onSignOut();
  };

  // Combined save for the single Edit Profile dialog. Persists name and DOB
  // always, and only attempts a password change when a new password is
  // entered (verifying the current one first).
  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      setError('Name cannot be empty');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const update: any = { full_name: editName.trim(), dob: dob || undefined };
      const { error: metaError } = await supabase.auth.updateUser({ data: update });
      if (metaError) throw metaError;

      if (newPassword) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) throw new Error('User email not found');
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (signInError) throw new Error('Current password is incorrect');
        const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
        if (pwError) throw pwError;
      }

      setUser((prev: any) => prev ? {
        ...prev,
        user_metadata: { ...prev.user_metadata, full_name: editName.trim(), dob: dob || undefined },
      } : null);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setEditProfileOpen(false), 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  if (loading) {
    return (
      <IconButton
        onClick={handleMenuOpen}
        size="small"
        color="inherit"
        sx={{ width: 36, height: 36 }}
        disabled
      >
        <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'action.hover', animation: 'pulse 1.5s infinite' }} />
      </IconButton>
    );
  }

  return (
    <Box>
      {/* Profile Avatar Button */}
      <IconButton
        onClick={handleMenuOpen}
        size="small"
        color="inherit"
        sx={{
          width: 36,
          height: 36,
          '& .MuiAvatar-root': {
            width: 32,
            height: 32,
            fontSize: '13px',
            fontWeight: 600,
          }
        }}
      >
        <Avatar sx={{ bgcolor: '#2563eb', color: '#fff' }}>
          {getInitials(displayName)}
        </Avatar>
      </IconButton>

      {/* Profile Dropdown Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{
          sx: {
            minWidth: 240,
            borderRadius: 2,
            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            border: '1px solid',
            borderColor: 'divider',
            mt: 1,
          }
        }}
      >
        <MenuList sx={{ py: 1, px: 1 }}>
          {/* User Info Header */}
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ width: 44, height: 44, fontSize: '16px', fontWeight: 600, bgcolor: '#2563eb' }}>
              {getInitials(displayName)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayName}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.email}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 0.5 }} />

          {/* Theme Toggle - inside the profile box */}
          {toggleTheme && (
            <>
              <MenuItem
                onClick={() => { toggleTheme(); handleMenuClose(); }}
                sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } }}
              >
                {mode === 'dark' ? <Sun size={18} color="#64748b" /> : <Moon size={18} color="#64748b" />}
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {mode === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
                </Typography>
              </MenuItem>

              <Divider sx={{ my: 0.5 }} />
            </>
          )}

          {/* Menu Items */}
          <MenuItem
            onClick={handleEditProfileClick}
            sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Edit size={18} color="#64748b" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Edit Profile</Typography>
          </MenuItem>

          <Divider sx={{ my: 0.5 }} />

          <MenuItem
            onClick={handleSignOutClick}
            sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 1.5, color: '#ef4444', '&:hover': { bgcolor: 'rgba(239,68,68,0.1)' } }}
          >
            <LogOut size={18} />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Sign Out</Typography>
          </MenuItem>
        </MenuList>
      </Menu>

      {/* Edit Profile Dialog — single centered dialog for name, email,
          date of birth and password change. */}
      <Dialog
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3, p: 0.5 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, px: 3, pt: 2, pb: 1 }}>Edit Profile</DialogTitle>
        <DialogContent sx={{ px: 3, pb: 1 }}>
          {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 1 }}>{success}</Alert>}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start" sx={{ mr: 0.5 }}>
                    <User size={20} color="#94a3b8" />
                  </InputAdornment>
                )
              }}
            />

            <TextField
              fullWidth
              label="Email"
              value={user?.email || ''}
              InputProps={{ readOnly: true }}
            />

            <TextField
              fullWidth
              label="Date of Birth"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary', fontWeight: 600 }}>
            Change Password
            <Typography component="span" sx={{ fontWeight: 400, ml: 0.5 }}>
              (optional — leave blank to keep current)
            </Typography>
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              fullWidth
              label="Current Password"
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <MuiIconButton size="small" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                      {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </MuiIconButton>
                  </InputAdornment>
                )
              }}
            />

            <TextField
              fullWidth
              label="New Password"
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              helperText="Minimum 6 characters"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <MuiIconButton size="small" onClick={() => setShowNewPassword(!showNewPassword)}>
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </MuiIconButton>
                  </InputAdornment>
                )
              }}
            />

            <TextField
              fullWidth
              label="Confirm New Password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <MuiIconButton size="small" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </MuiIconButton>
                  </InputAdornment>
                )
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 1, gap: 1, '& button': { textTransform: 'none', borderRadius: 2 } }}>
          <Button onClick={() => setEditProfileOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveProfile}
            variant="contained"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
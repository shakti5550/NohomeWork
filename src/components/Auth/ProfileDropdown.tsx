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
  Alert,
  FormControl,
  InputLabel,
  Select,
  NativeSelect,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  User, Edit, Lock, Calendar, LogOut, Eye, EyeOff, Save, X
} from 'lucide-react';
import { supabase } from '../../storage/supabaseClient';

interface ProfileDropdownProps {
  onSignOut: () => void;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ onSignOut }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [editDobOpen, setEditDobOpen] = useState(false);

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

  const handleEditNameClick = () => {
    handleMenuClose();
    setEditNameOpen(true);
  };

  const handleChangePasswordClick = () => {
    handleMenuClose();
    setChangePasswordOpen(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleEditDobClick = () => {
    handleMenuClose();
    setEditDobOpen(true);
  };

  const handleSignOutClick = () => {
    handleMenuClose();
    onSignOut();
  };

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: editName.trim() }
      });
      if (error) throw error;
      setUser(prev => prev ? { ...prev, user_metadata: { ...prev.user_metadata, full_name: editName.trim() } } : null);
      setSuccess('Name updated successfully!');
      setTimeout(() => setEditNameOpen(false), 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // First verify current password by signing in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('User email not found');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) throw new Error('Current password is incorrect');

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setSuccess('Password changed successfully!');
      setTimeout(() => setChangePasswordOpen(false), 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDob = async () => {
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { dob: dob || undefined }
      });
      if (error) throw error;
      setUser(prev => prev ? { ...prev, user_metadata: { ...prev.user_metadata, dob } } : null);
      setSuccess('Date of birth updated!');
      setTimeout(() => setEditDobOpen(false), 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to update date of birth');
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

          {/* Menu Items */}
          <MenuItem
            onClick={handleEditNameClick}
            sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Edit size={18} color="#64748b" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Edit Name</Typography>
          </MenuItem>

          <MenuItem
            onClick={handleChangePasswordClick}
            sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Lock size={18} color="#64748b" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Change Password</Typography>
          </MenuItem>

          <MenuItem
            onClick={handleEditDobClick}
            sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Calendar size={18} color="#64748b" />
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Date of Birth</Typography>
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

      {/* Edit Name Dialog */}
      <Dialog
        open={editNameOpen}
        onClose={() => setEditNameOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Name</DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          {error && <Alert severity="error" sx={{ mx: 3, mt: 2, mb: -1 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mx: 3, mt: 2, mb: -1 }}>{success}</Alert>}
          <TextField
            autoFocus
            fullWidth
            label="Full Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Enter your name"
            sx={{ mx: 3, mt: 2, mb: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <User size={20} color="#94a3b8" sx={{ mr: 1 }} />
                </InputAdornment>
              )
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3 }}>
          <Button onClick={() => setEditNameOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            onClick={handleSaveName}
            variant="contained"
            disabled={saving || !editName.trim()}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Change Password</DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          {error && <Alert severity="error" sx={{ mx: 3, mt: 2, mb: -1 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mx: 3, mt: 2, mb: -1 }}>{success}</Alert>}

          <TextField
            autoFocus
            fullWidth
            label="Current Password"
            type={showCurrentPassword ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            sx={{ mx: 3, mt: 2, mb: 1.5 }}
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
            sx={{ mx: 3, mb: 1.5 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <MuiIconButton size="small" onClick={() => setShowNewPassword(!showNewPassword)}>
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </MuiIconButton>
                </InputAdornment>
              )
            }}
            helperText="Minimum 6 characters"
          />

          <TextField
            fullWidth
            label="Confirm New Password"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            sx={{ mx: 3, mb: 1 }}
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
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3 }}>
          <Button onClick={() => setChangePasswordOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            onClick={handleChangePassword}
            variant="contained"
            disabled={saving}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {saving ? 'Changing...' : 'Change Password'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit DOB Dialog */}
      <Dialog
        open={editDobOpen}
        onClose={() => setEditDobOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Date of Birth</DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          {error && <Alert severity="error" sx={{ mx: 3, mt: 2, mb: -1 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mx: 3, mt: 2, mb: -1 }}>{success}</Alert>}
          <TextField
            autoFocus
            fullWidth
            label="Date of Birth"
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            sx={{ mx: 3, mt: 2, mb: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Calendar size={20} color="#94a3b8" sx={{ mr: 1 }} />
                </InputAdornment>
              )
            }}
            InputLabelProps={{ shrink: true }}
          />
          <Typography variant="caption" sx={{ mx: 3, color: 'text.secondary' }}>
            This will be stored in your profile metadata.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, px: 3 }}>
          <Button onClick={() => setEditDobOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            onClick={handleSaveDob}
            variant="contained"
            disabled={saving}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
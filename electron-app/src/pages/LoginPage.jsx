
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
    Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '../components/ui/card';
import { Eye, EyeOff, Globe } from 'lucide-react';

/**
 * LoginPage — mirrors the enterprise web app's auth page design exactly.
 * Uses the same Shadcn components (Card, Input, Button, Label).
 *
 * Handles four inline modes:
 *   'login'            — email + password form
 *   'new_password'     — NEW_PASSWORD_REQUIRED Cognito challenge
 *   'forgot_password'  — enter email to receive a reset code
 *   'confirm_password' — enter code + new password to complete reset
 */
export default function LoginPage() {
    const { login, requiresNewPassword, challengeUsername, submitNewPassword } = useAuth();

    const [mode, setMode]               = useState('login');
    const [email, setEmail]             = useState('');
    const [password, setPassword]       = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [resetCode, setResetCode]     = useState('');
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [showPassword, setShowPassword]     = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    // Switch to new-password mode when the challenge arrives from AuthContext
    useEffect(() => {
        if (requiresNewPassword) {
            setMode('new_password');
            setError('');
        }
    }, [requiresNewPassword]);

    // ─── Handlers ─────────────────────────────────────────────────────────────

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');
        try {
            const result = await login(email, password);
            if (!result.success && !result.requiresNewPassword) {
                setError(result.error || 'Login failed');
            }
            // On success AuthContext navigates → nothing else to do here
        } catch (err) {
            setError('An error occurred during authentication');
        } finally {
            setLoading(false);
        }
    };

    const handleNewPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const result = await submitNewPassword(newPassword);
            if (!result.success) setError(result.error || 'Failed to update password');
        } catch (err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');
        try {
            const result = await window.electronAPI.auth.forgotPassword(email);
            if (result.success) {
                setMode('confirm_password');
                setSuccessMessage('Password reset code sent to your email.');
            } else {
                setError(result.error || 'Failed to request password reset');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');
        try {
            const result = await window.electronAPI.auth.confirmPassword(email, resetCode, newPassword);
            if (result.success) {
                setMode('login');
                setSuccessMessage('Password reset successful. Please sign in with your new password.');
                setNewPassword('');
                setResetCode('');
            } else {
                setError(result.error || 'Failed to reset password');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleBrowserSSO = async () => {
        setError('');
        try {
            await window.electronAPI.auth.openBrowserSSO();
        } catch (err) {
            setError('Failed to open browser: ' + err.message);
        }
    };

    // ─── Derived UI strings ───────────────────────────────────────────────────

    const titleMap = {
        login:            'CloudVault Agent',
        new_password:     'Set New Password',
        forgot_password:  'Reset Password',
        confirm_password: 'Confirm New Password',
    };
    const descMap = {
        login:            'Authenticate strictly via corporate credentials.',
        new_password:     'Your account requires you to set a new password.',
        forgot_password:  'Enter your email to receive a reset code.',
        confirm_password: 'Enter the reset code and your new password.',
    };
    const submitLabelMap = {
        login:            'Sign In',
        new_password:     'Update Password',
        forgot_password:  'Send Reset Code',
        confirm_password: 'Confirm Password',
    };

    const onSubmit =
        mode === 'login'            ? handleLogin           :
        mode === 'new_password'     ? handleNewPassword     :
        mode === 'forgot_password'  ? handleForgotPassword  :
        handleConfirmPassword;

    return (
        <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold tracking-tight text-center">
                        {titleMap[mode]}
                    </CardTitle>
                    <CardDescription className="text-center">
                        {descMap[mode]}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    <form onSubmit={onSubmit} className="space-y-4">

                        {/* Email field — shown on login, forgot, and confirm modes */}
                        {mode !== 'new_password' && (
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    disabled={mode === 'confirm_password'}
                                />
                            </div>
                        )}

                        {/* Password field — login mode only */}
                        {mode === 'login' && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password">Password</Label>
                                    <Button
                                        variant="link"
                                        className="h-auto p-0 text-xs text-muted-foreground"
                                        type="button"
                                        onClick={() => { setMode('forgot_password'); setError(''); setSuccessMessage(''); }}
                                    >
                                        Forgot Password?
                                    </Button>
                                </div>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                        tabIndex={-1}
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* New password field — new_password + confirm_password modes */}
                        {(mode === 'new_password' || mode === 'confirm_password') && (
                            <>
                                {mode === 'confirm_password' && (
                                    <div className="space-y-2">
                                        <Label htmlFor="resetCode">Verification Code</Label>
                                        <Input
                                            id="resetCode"
                                            type="text"
                                            placeholder="Enter code from email"
                                            value={resetCode}
                                            onChange={e => setResetCode(e.target.value)}
                                            required
                                        />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="newPassword">
                                        {mode === 'new_password' ? 'New Password Required' : 'New Password'}
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            id="newPassword"
                                            type={showNewPassword ? 'text' : 'password'}
                                            placeholder="Enter new password"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            required
                                            className="pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                            tabIndex={-1}
                                            aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Messages */}
                        {error          && <div className="text-sm font-medium text-red-500 text-center">{error}</div>}
                        {successMessage && <div className="text-sm font-medium text-green-600 text-center">{successMessage}</div>}

                        {/* Primary action */}
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Processing...' : submitLabelMap[mode]}
                        </Button>

                        {/* Back to login for non-login modes */}
                        {mode !== 'login' && (
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full mt-2"
                                disabled={loading}
                                onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }}
                            >
                                Back to Login
                            </Button>
                        )}
                    </form>

                    {/* SSO separator + button — login mode only */}
                    {mode === 'login' && (
                        <>
                            <div className="relative my-4">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-slate-300 dark:border-slate-700" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-white dark:bg-slate-900 px-2 text-slate-500">Or continue with</span>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full flex items-center justify-center gap-2"
                                onClick={handleBrowserSSO}
                            >
                                <Globe size={16} />
                                <span>Login via Browser (SSO)</span>
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

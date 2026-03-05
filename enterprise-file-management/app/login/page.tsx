'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/components/providers/AuthProvider';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
    const { login } = useAuth();
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [newPassword, setNewPassword] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [successMessage, setSuccessMessage] = React.useState('');
    const [requiresNewPassword, setRequiresNewPassword] = React.useState(false);
    const [session, setSession] = React.useState('');
    const [mode, setMode] = React.useState<'login' | 'forgot_password' | 'confirm_password'>('login');
    const [resetCode, setResetCode] = React.useState('');
    const [showPassword, setShowPassword] = React.useState(false);
    const [showNewPassword, setShowNewPassword] = React.useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const redirectAfterLogin = searchParams.get('redirect') || null;

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');
        
        try {
            if (requiresNewPassword) {
                const res = await fetch('/api/auth/new-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, newPassword, session })
                });
                const data = await res.json();
                
                if (res.ok) {
                    // Hydrate AuthProvider so AppSidebar gets the user
                    if (data.accessToken) {
                        const userData = {
                            id: data.id || '',
                            email,
                            name: data.name || email.split('@')[0],
                            role: data.role,
                            tenantId: data.tenantId || '',
                            tenantName: data.tenantName || '',
                            policies: data.policies || [],
                            teams: data.teams || [],
                        };
                        login(data.accessToken, userData, redirectAfterLogin || (data.role === 'PLATFORM_ADMIN' ? '/superadmin' : '/'));
                    } else {
                        router.push(redirectAfterLogin || (data.role === 'PLATFORM_ADMIN' ? '/superadmin' : '/'));
                    }
                } else {
                    setError(data.error || 'Failed to update password');
                }
            } else {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                
                if (res.ok) {
                    if (data.challengeName === 'NEW_PASSWORD_REQUIRED') {
                        setRequiresNewPassword(true);
                        setSession(data.session);
                    } else {
                        // Hydrate AuthProvider so AppSidebar gets the user
                        if (data.accessToken) {
                            const userData = {
                                id: data.id || '',
                                email,
                                name: data.name || email.split('@')[0],
                                role: data.role,
                                tenantId: data.tenantId || '',
                                tenantName: data.tenantName || '',
                                policies: data.policies || [],
                                teams: data.teams || [],
                            };
                            // If the login was triggered by the Electron SSO button, redirect
                            // back to /api/auth/agent-sso so it can issue the cloudvault:// link
                            const dest = redirectAfterLogin || (data.role === 'PLATFORM_ADMIN' ? '/superadmin' : '/');
                            login(data.accessToken, userData, dest);
                        } else {
                            router.push(data.role === 'PLATFORM_ADMIN' ? '/superadmin' : '/');
                        }
                    }
                } else {
                    if (res.status === 403 && data.error === 'IP_BLOCKED') {
                        router.push('/ip-blocked');
                    } else {
                        setError(data.error || 'Login failed');
                    }
                }
            }
        } catch(err) {
            setError('An error occurred during authentication');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');
        
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            
            if (res.ok) {
                setMode('confirm_password');
                setSuccessMessage('Password reset code sent to your email.');
            } else {
                setError(data.error || 'Failed to request password reset');
            }
        } catch(err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');
        
        try {
            const res = await fetch('/api/auth/confirm-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code: resetCode, newPassword })
            });
            const data = await res.json();
            
            if (res.ok) {
                setMode('login');
                setSuccessMessage('Password reset successful. Please login with your new password.');
                setNewPassword('');
                setResetCode('');
            } else {
                setError(data.error || 'Failed to reset password');
            }
        } catch(err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSSO = () => {
        // Redirect to Cognito Hosted UI via our backend route
        window.location.href = '/api/auth/google';
    };

    return (
        <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold tracking-tight text-center">
                        {mode === 'login' && 'FMS Login'}
                        {mode === 'forgot_password' && 'Reset Password'}
                        {mode === 'confirm_password' && 'Confirm New Password'}
                    </CardTitle>
                    <CardDescription className="text-center">
                        {mode === 'login' && 'Authenticate strictly via corporate credentials.'}
                        {mode === 'forgot_password' && 'Enter your email to receive a reset code.'}
                        {mode === 'confirm_password' && 'Enter the reset code and your new password.'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form 
                        onSubmit={
                            mode === 'login' ? handleLogin : 
                            mode === 'forgot_password' ? handleForgotPassword : 
                            handleConfirmPassword
                        } 
                        className="space-y-4"
                    >
                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input 
                                id="email" 
                                type="email" 
                                placeholder="Admin@fms.com" 
                                value={email} 
                                onChange={e => setEmail(e.target.value)} 
                                required 
                                disabled={requiresNewPassword || mode === 'confirm_password'}
                            />
                        </div>
                        
                        {mode === 'login' && !requiresNewPassword && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password">Password</Label>
                                    <Button 
                                        variant="link" 
                                        className="h-auto p-0 text-xs text-muted-foreground"
                                        type="button"
                                        onClick={() => {
                                            setMode('forgot_password');
                                            setError('');
                                            setSuccessMessage('');
                                        }}
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

                        {mode === 'login' && requiresNewPassword && (
                            <div className="space-y-2">
                                <Label htmlFor="newPassword">New Password Required</Label>
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
                                <p className="text-xs text-muted-foreground">
                                    Your account requires you to set a new password.
                                </p>
                            </div>
                        )}

                        {mode === 'confirm_password' && (
                            <>
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
                                <div className="space-y-2">
                                    <Label htmlFor="newResetPassword">New Password</Label>
                                    <div className="relative">
                                        <Input 
                                            id="newResetPassword" 
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

                        {error && <div className="text-sm font-medium text-red-500 text-center">{error}</div>}
                        {successMessage && <div className="text-sm font-medium text-green-500 text-center">{successMessage}</div>}
                        
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Processing...' : (
                                mode === 'login' ? (requiresNewPassword ? 'Update Password' : 'Sign In') :
                                mode === 'forgot_password' ? 'Send Reset Code' :
                                'Confirm Password'
                            )}
                        </Button>

                        {mode !== 'login' && (
                            <Button 
                                type="button" 
                                variant="outline" 
                                className="w-full mt-2" 
                                disabled={loading}
                                onClick={() => {
                                    setMode('login');
                                    setError('');
                                    setSuccessMessage('');
                                }}
                            >
                                Back to Login
                            </Button>
                        )}
                    </form>
                    
                    {mode === 'login' && !requiresNewPassword && (
                        <>
                            <div className="relative my-4">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t border-slate-300 dark:border-slate-700" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-slate-50 dark:bg-slate-900 px-2 text-slate-500">Or continue with</span>
                                </div>
                            </div>
                            <Button 
                                type="button" 
                                variant="outline" 
                                className="w-full flex items-center justify-center space-x-2"
                                onClick={handleGoogleSSO}
                            >
                                <svg width="20" height="20" viewBox="0 0 48 48">
                                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                                </svg>
                                <span>Sign in with Google</span>
                            </Button>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

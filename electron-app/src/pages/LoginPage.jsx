import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
    Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '../components/ui/card';
import { Eye, EyeOff, Globe, Bot, Key, Copy, Check, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';

/**
 * LoginPage — three top-level modes:
 *   'login'            — email + password (Cognito direct)
 *   'sso'              — PKCE loopback browser SSO
 *   'bot'              — Bot key-pair authentication
 *
 * Bot sub-modes:
 *   'bot_generate'     — Phase A: generate key pair, display public key
 *   'bot_register'     — Phase B: enter Bot_ID from web dashboard
 *   'bot_handshake'    — Phase C: performing handshake
 *
 * Password sub-modes (within 'login'):
 *   'new_password'     — NEW_PASSWORD_REQUIRED Cognito challenge
 *   'forgot_password'  — enter email to receive reset code
 *   'confirm_password' — enter code + new password
 */
export default function LoginPage() {
    const { login, requiresNewPassword, challengeUsername, submitNewPassword, loginAsBot } = useAuth();

    // Top-level mode
    const [topMode, setTopMode]   = useState('sso'); // 'login' | 'sso' | 'bot'
    // Password sub-mode
    const [pwMode, setPwMode]     = useState('login'); // 'login' | 'new_password' | 'forgot_password' | 'confirm_password'
    // Bot sub-mode
    const [botMode, setBotMode]   = useState('bot_generate'); // 'bot_generate' | 'bot_register' | 'bot_handshake'

    // Form state
    const [email, setEmail]             = useState('');
    const [password, setPassword]       = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [resetCode, setResetCode]     = useState('');
    const [botId, setBotId]             = useState('');
    const [publicKey, setPublicKey]     = useState('');
    const [copied, setCopied]           = useState(false);

    const [loading, setLoading]         = useState(false);
    const [ssoWaiting, setSsoWaiting]   = useState(false);
    const [error, setError]             = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [showPassword, setShowPassword]     = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    // Switch to new-password mode when Cognito challenge arrives
    useEffect(() => {
        if (requiresNewPassword) {
            setTopMode('login');
            setPwMode('new_password');
            setError('');
        }
    }, [requiresNewPassword]);

    // On mount: check if a key pair already exists
    useEffect(() => {
        async function checkExistingKey() {
            if (!window.electronAPI?.bot) return;
            const { hasKeyPair, publicKey: pk } = await window.electronAPI.bot.getPublicKey();
            if (hasKeyPair && pk) {
                setPublicKey(pk);
                setBotMode('bot_register');
            }
        }
        checkExistingKey();
    }, []);

    const clearMessages = () => { setError(''); setSuccessMessage(''); };

    // ─── Password / Cognito handlers ──────────────────────────────────────────

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true); clearMessages();
        try {
            const result = await login(email, password);
            if (!result.success && !result.requiresNewPassword) {
                setError(result.error || 'Login failed');
            }
        } catch (err) {
            setError('An error occurred during authentication');
        } finally {
            setLoading(false);
        }
    };

    const handleNewPassword = async (e) => {
        e.preventDefault();
        setLoading(true); clearMessages();
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
        setLoading(true); clearMessages();
        try {
            const result = await window.electronAPI.auth.forgotPassword(email);
            if (result.success) {
                setPwMode('confirm_password');
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
        setLoading(true); clearMessages();
        try {
            const result = await window.electronAPI.auth.confirmPassword(email, resetCode, newPassword);
            if (result.success) {
                setPwMode('login');
                setSuccessMessage('Password reset successful. Please sign in.');
                setNewPassword(''); setResetCode('');
            } else {
                setError(result.error || 'Failed to reset password');
            }
        } catch (err) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    // ─── SSO handler ──────────────────────────────────────────────────────────

    const handleBrowserSSO = async () => {
        clearMessages();
        setSsoWaiting(true);
        try {
            const result = await window.electronAPI.auth.openBrowserSSO();
            if (!result.success) {
                setError(result.error || 'SSO login failed');
                setSsoWaiting(false);
            }
            // On success, AuthContext's onSSOResult listener handles navigation
        } catch (err) {
            setError('Failed to open browser: ' + err.message);
            setSsoWaiting(false);
        }
    };

    // ─── Bot handlers ─────────────────────────────────────────────────────────

    const handleGenerateKeyPair = async () => {
        setLoading(true); clearMessages();
        try {
            const result = await window.electronAPI.bot.generateKeyPair();
            if (result.success) {
                setPublicKey(result.publicKey);
                setBotMode('bot_register');
            } else {
                setError(result.error || 'Failed to generate key pair');
            }
        } catch (err) {
            setError('Key generation failed: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCopyPublicKey = async () => {
        try {
            await navigator.clipboard.writeText(publicKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setError('Failed to copy to clipboard');
        }
    };

    const handleBotHandshake = async (e) => {
        e.preventDefault();
        if (!botId.trim()) { setError('Please enter your Bot ID'); return; }
        setLoading(true); clearMessages();
        setBotMode('bot_handshake');
        try {
            await window.electronAPI.bot.saveBotId(botId.trim());
            const result = await loginAsBot(botId.trim());
            if (!result.success) {
                setError(result.error || 'Handshake failed');
                setBotMode('bot_register');
            }
            // On success, AuthContext navigates to dashboard
        } catch (err) {
            setError('Handshake failed: ' + err.message);
            setBotMode('bot_register');
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerateKey = async () => {
        if (!window.confirm('This will generate a new key pair. Your existing Bot ID will no longer work until you re-register the new public key. Continue?')) return;
        setLoading(true); clearMessages();
        try {
            const result = await window.electronAPI.bot.generateKeyPair();
            if (result.success) {
                setPublicKey(result.publicKey);
                setBotId('');
                setBotMode('bot_register');
                setSuccessMessage('New key pair generated. Register the new public key in the web dashboard.');
            } else {
                setError(result.error || 'Failed to regenerate key pair');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ─── Render helpers ───────────────────────────────────────────────────────

    const renderPasswordForm = () => {
        const onSubmit =
            pwMode === 'login'            ? handleLogin           :
            pwMode === 'new_password'     ? handleNewPassword     :
            pwMode === 'forgot_password'  ? handleForgotPassword  :
            handleConfirmPassword;

        const titleMap = {
            login:            'Sign In',
            new_password:     'Set New Password',
            forgot_password:  'Reset Password',
            confirm_password: 'Confirm New Password',
        };
        const submitLabelMap = {
            login:            'Sign In',
            new_password:     'Update Password',
            forgot_password:  'Send Reset Code',
            confirm_password: 'Confirm Password',
        };

        return (
            <form onSubmit={onSubmit} className="space-y-4">
                {pwMode !== 'new_password' && (
                    <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input id="email" type="email" placeholder="you@company.com"
                            value={email} onChange={e => setEmail(e.target.value)}
                            required disabled={pwMode === 'confirm_password'} />
                    </div>
                )}

                {pwMode === 'login' && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="password">Password</Label>
                            <Button variant="link" className="h-auto p-0 text-xs text-muted-foreground" type="button"
                                onClick={() => { setPwMode('forgot_password'); clearMessages(); }}>
                                Forgot Password?
                            </Button>
                        </div>
                        <div className="relative">
                            <Input id="password" type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••" value={password}
                                onChange={e => setPassword(e.target.value)} required className="pr-10" />
                            <button type="button" onClick={() => setShowPassword(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                )}

                {(pwMode === 'new_password' || pwMode === 'confirm_password') && (
                    <>
                        {pwMode === 'confirm_password' && (
                            <div className="space-y-2">
                                <Label htmlFor="resetCode">Verification Code</Label>
                                <Input id="resetCode" type="text" placeholder="Enter code from email"
                                    value={resetCode} onChange={e => setResetCode(e.target.value)} required />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">
                                {pwMode === 'new_password' ? 'New Password Required' : 'New Password'}
                            </Label>
                            <div className="relative">
                                <Input id="newPassword" type={showNewPassword ? 'text' : 'password'}
                                    placeholder="Enter new password" value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)} required className="pr-10" />
                                <button type="button" onClick={() => setShowNewPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    tabIndex={-1}>
                                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {error          && <p className="text-sm font-medium text-red-500 text-center">{error}</p>}
                {successMessage && <p className="text-sm font-medium text-green-600 text-center">{successMessage}</p>}

                <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <><Loader2 size={16} className="mr-2 animate-spin" />Processing…</> : submitLabelMap[pwMode]}
                </Button>

                {pwMode !== 'login' && (
                    <Button type="button" variant="outline" className="w-full mt-2" disabled={loading}
                        onClick={() => { setPwMode('login'); clearMessages(); }}>
                        <ArrowLeft size={14} className="mr-2" /> Back to Login
                    </Button>
                )}
            </form>
        );
    };

    const renderSSOPanel = () => (
        <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">1</span>
                    <span>Click the button below — your browser will open to the CloudVault login page.</span>
                </div>
                <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
                    <span>Authenticate with your SSO provider (Google, Okta, etc.).</span>
                </div>
                <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">3</span>
                    <span>You'll be redirected back to CloudVault automatically.</span>
                </div>
            </div>

            {error && <p className="text-sm font-medium text-red-500 text-center">{error}</p>}

            {ssoWaiting ? (
                <div className="flex flex-col items-center gap-3 py-4">
                    <Loader2 size={32} className="animate-spin text-blue-500" />
                    <p className="text-sm text-slate-500">Waiting for browser authentication…</p>
                    <Button variant="ghost" size="sm" onClick={() => { setSsoWaiting(false); clearMessages(); }}>
                        Cancel
                    </Button>
                </div>
            ) : (
                <Button className="w-full flex items-center justify-center gap-2" onClick={handleBrowserSSO}>
                    <Globe size={16} />
                    Open Browser to Sign In
                </Button>
            )}
        </div>
    );

    const renderBotPanel = () => {
        if (botMode === 'bot_generate') {
            return (
                <div className="space-y-4">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-2">
                        <p className="font-medium">Identity Creation</p>
                        <p>Generate a key pair on this machine. The private key stays here; you'll register the public key in the web dashboard.</p>
                    </div>
                    {error && <p className="text-sm font-medium text-red-500 text-center">{error}</p>}
                    <Button className="w-full flex items-center justify-center gap-2" onClick={handleGenerateKeyPair} disabled={loading}>
                        {loading
                            ? <><Loader2 size={16} className="mr-2 animate-spin" />Generating…</>
                            : <><Key size={16} />Generate Key Pair</>}
                    </Button>
                </div>
            );
        }

        if (botMode === 'bot_register') {
            return (
                <div className="space-y-4">
                    {/* Phase B instructions */}
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-2">
                        <p className="font-medium">Register in Web Dashboard</p>
                        <ol className="list-decimal list-inside space-y-1 text-xs">
                            <li>Copy the public key below.</li>
                            <li>Go to the CloudVault web dashboard → Bots → Add Bot.</li>
                            <li>Paste the public key and set permissions.</li>
                            <li>Copy the Bot ID you receive and paste it below.</li>
                        </ol>
                    </div>

                    {/* Public key display */}
                    <div className="space-y-2">
                        <Label>Your Public Key</Label>
                        <div className="relative">
                            <textarea
                                readOnly
                                value={publicKey}
                                rows={5}
                                className="w-full rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-700 resize-none focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={handleCopyPublicKey}
                                className="absolute top-2 right-2 p-1.5 rounded bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
                                title="Copy public key"
                            >
                                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                            </button>
                        </div>
                    </div>

                    {/* Bot ID input */}
                    <form onSubmit={handleBotHandshake} className="space-y-3">
                        <div className="space-y-2">
                            <Label htmlFor="botId">Bot ID (from web dashboard)</Label>
                            <Input id="botId" type="text" placeholder="e.g. clxyz123abc..."
                                value={botId} onChange={e => setBotId(e.target.value)} required />
                        </div>

                        {error          && <p className="text-sm font-medium text-red-500 text-center">{error}</p>}
                        {successMessage && <p className="text-sm font-medium text-green-600 text-center">{successMessage}</p>}

                        <Button type="submit" className="w-full flex items-center justify-center gap-2" disabled={loading || !botId.trim()}>
                            {loading
                                ? <><Loader2 size={16} className="mr-2 animate-spin" />Connecting…</>
                                : <><ShieldCheck size={16} />Connect as Bot</>}
                        </Button>
                    </form>

                    <Button variant="ghost" size="sm" className="w-full text-xs text-slate-400" onClick={handleRegenerateKey} disabled={loading}>
                        Regenerate Key Pair
                    </Button>
                </div>
            );
        }

        // bot_handshake — loading state
        return (
            <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 size={40} className="animate-spin text-blue-500" />
                <p className="text-sm text-slate-500">Performing handshake with server…</p>
                <p className="text-xs text-slate-400">Verifying your key pair signature</p>
            </div>
        );
    };

    // ─── Top-level render ─────────────────────────────────────────────────────

    const tabConfig = [
        // { id: 'login', label: 'Password',   icon: <Eye size={14} /> },
        { id: 'sso',   label: 'SSO',        icon: <Globe size={14} /> },
        { id: 'bot',   label: 'Bot',        icon: <Bot size={14} /> },
    ];

    const cardTitleMap = {
        login: pwMode === 'login' ? 'CloudVault Agent' :
               pwMode === 'new_password' ? 'Set New Password' :
               pwMode === 'forgot_password' ? 'Reset Password' : 'Confirm New Password',
        sso:   'Browser SSO Login',
        bot:   'Bot Authentication',
    };

    const cardDescMap = {
        login: pwMode === 'login' ? 'Sign in with your corporate credentials.' :
               pwMode === 'new_password' ? 'Your account requires a new password.' :
               pwMode === 'forgot_password' ? 'Enter your email to receive a reset code.' :
               'Enter the reset code and your new password.',
        sso:   'Authenticate via your SSO provider in the browser.',
        bot:   'Headless machine identity using asymmetric key-pair.',
    };

    return (
        <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="space-y-1 pb-4">
                    <CardTitle className="text-2xl font-bold tracking-tight text-center">
                        {cardTitleMap[topMode]}
                    </CardTitle>
                    <CardDescription className="text-center">
                        {cardDescMap[topMode]}
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Mode tabs — only show on top-level login (not sub-modes) */}
                    {/* (topMode !== 'login' || pwMode === 'login') && */ (
                        <div className="flex rounded-lg border border-slate-200 p-1 gap-1 bg-slate-50">
                            {tabConfig.map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => { setTopMode(tab.id); clearMessages(); setSsoWaiting(false); }}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-medium transition-all cursor-pointer ${
                                        topMode === tab.id
                                            ? 'bg-white shadow-sm text-slate-900 border border-slate-200'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Panel content */}
                    {topMode === 'login' && renderPasswordForm()}
                    {topMode === 'sso'   && renderSSOPanel()}
                    {topMode === 'bot'   && renderBotPanel()}
                </CardContent>
            </Card>
        </div>
    );
}

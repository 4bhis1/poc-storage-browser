
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [token, setToken]                       = useState(null);
    const [user, setUser]                         = useState(null);
    const [loading, setLoading]                   = useState(true);
    const [isBot, setIsBot]                       = useState(false);
    const [botName, setBotName]                   = useState(null);
    const [isAutoLogin, setIsAutoLogin]           = useState(false);
    // NEW_PASSWORD_REQUIRED challenge state
    const [requiresNewPassword, setRequiresNewPassword] = useState(false);
    const [challengeSession, setChallengeSession] = useState(null);
    const [challengeUsername, setChallengeUsername] = useState(null);

    const navigate = useNavigate();

    // ─── Helpers ─────────────────────────────────────────────────────────────

    const _decodeUser = (idToken) => {
        try {
            const payload = JSON.parse(atob(idToken.split('.')[1]));
            return {
                email:    payload.email || payload['cognito:username'] || '',
                username: payload['cognito:username'] || payload.email || '',
                name:     payload.name || payload.email?.split('@')[0] || 'User',
                sub:      payload.sub || '',
            };
        } catch {
            return { email: '', username: '', name: 'User', sub: '' };
        }
    };

    const _isTokenExpired = (token) => {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp ? payload.exp * 1000 < Date.now() : false;
        } catch {
            return true;
        }
    };

    const _hydrateFromSession = useCallback(async () => {
        if (!window.electronAPI?.auth) {
            setLoading(false);
            return;
        }
        try {
            // Check if this machine has a registered bot identity — if so, prefer bot auth
            const hasBotIdentity = window.electronAPI?.bot?.getBotId
                ? (await window.electronAPI.bot.getBotId())?.botId
                : null;

            // If bot identity exists, attempt bot auto-login FIRST (takes priority)
            if (hasBotIdentity && window.electronAPI?.bot?.attemptAutoLogin) {
                console.log('[AuthContext] Bot identity found, attempting bot auto-login first...');
                const autoLoginResult = await window.electronAPI.bot.attemptAutoLogin();
                if (autoLoginResult.success) {
                    console.log('[AuthContext] Bot auto-login successful');
                    setToken(autoLoginResult.accessToken);
                    setIsBot(true);
                    setIsAutoLogin(true);
                    
                    // Decode bot name from JWT
                    let resolvedBotName = 'Service Agent';
                    try {
                        const p = JSON.parse(atob(autoLoginResult.accessToken.split('.')[1]));
                        if (p.botName) resolvedBotName = p.botName;
                    } catch {}
                    
                    setBotName(resolvedBotName);
                    setUser({ 
                        email: autoLoginResult.email, 
                        username: autoLoginResult.email, 
                        name: resolvedBotName, 
                        sub: autoLoginResult.botId 
                    });
                    
                    window.electronAPI.initSync?.(autoLoginResult.accessToken);
                    window.electronAPI.syncBucketsNow?.().catch(e => console.warn('[AuthContext] Auto-login bucket sync failed:', e));
                    setLoading(false);
                    return;
                }
                console.log('[AuthContext] Bot auto-login failed:', autoLoginResult.reason, '— falling through to SSO');
            }

            // No bot identity or bot login failed — try existing Cognito session
            const session = await window.electronAPI.auth.getSession();
            if (session?.accessToken && !_isTokenExpired(session.idToken || session.accessToken)) {
                setToken(session.accessToken);
                const decoded = _decodeUser(session.idToken || session.accessToken);
                setUser({ ...decoded, email: session.email || decoded.email });
                // Re-init sync engine with the stored token
                window.electronAPI.initSync?.(session.idToken || session.accessToken);
                // Populate buckets in local DB immediately
                window.electronAPI.syncBucketsNow?.().catch(e => console.warn('[AuthContext] Bucket sync failed:', e));
                setLoading(false);
                return;
            }

            // Cognito token expired — try silent refresh
            if (session?.accessToken && _isTokenExpired(session.idToken || session.accessToken)) {
                console.log('[AuthContext] Cognito token expired, attempting refresh...');
                const refreshResult = await window.electronAPI.auth.refresh();
                if (refreshResult?.success) {
                    const newToken = refreshResult.idToken || refreshResult.accessToken;
                    setToken(newToken);
                    const decoded = _decodeUser(newToken);
                    setUser({ ...decoded, email: session.email || decoded.email });
                    window.electronAPI.initSync?.(newToken);
                    window.electronAPI.syncBucketsNow?.().catch(e => console.warn('[AuthContext] Bucket sync failed:', e));
                    setLoading(false);
                    return;
                }
                console.log('[AuthContext] Cognito refresh failed');
            }
        } catch (err) {
            console.warn('[AuthContext] Session hydration failed:', err);
        } finally {
            setLoading(false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Mount: hydrate session + wire SSO + auth-expired listeners ──────────
    useEffect(() => {
        _hydrateFromSession();

        let cleanupSSO = null;
        let cleanupExpired = null;

        if (window.electronAPI?.auth?.onSSOResult) {
            cleanupSSO = window.electronAPI.auth.onSSOResult((data) => {
                console.log('[AuthContext] SSO result received');
                setToken(data.idToken);
                const decoded = _decodeUser(data.idToken);
                setUser({ ...decoded, email: data.email || decoded.email });
                window.electronAPI.initSync?.(data.idToken);
                // Populate buckets before navigating
                window.electronAPI.syncBucketsNow?.().catch(e => console.warn('[AuthContext] Bucket sync failed:', e));
                navigate('/');
            });
        }

        if (window.electronAPI?.onAuthExpired) {
            cleanupExpired = window.electronAPI.onAuthExpired(() => {
                console.warn('[AuthContext] Auth expired signal from backend');
                _clearState();
                navigate('/login');
            });
        }

        return () => {
            cleanupSSO?.();
            cleanupExpired?.();
        };
    }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

    // ─── Actions ──────────────────────────────────────────────────────────────

    const _clearState = () => {
        setToken(null);
        setUser(null);
        setIsBot(false);
        setBotName(null);
        setIsAutoLogin(false);
        setRequiresNewPassword(false);
        setChallengeSession(null);
        setChallengeUsername(null);
    };

    /**
     * Primary sign-in. Returns:
     *   { success: true }                           — landed on dashboard
     *   { success: true, requiresNewPassword: true } — challenge needed
     *   { success: false, error: string }
     */
    const login = async (email, password) => {
        try {
            const result = await window.electronAPI.auth.login(email, password);
            if (!result.success) {
                return { success: false, error: result.error || 'Login failed' };
            }
            if (result.challengeName === 'NEW_PASSWORD_REQUIRED') {
                setRequiresNewPassword(true);
                setChallengeSession(result.session);
                setChallengeUsername(result.username || email);
                return { success: true, requiresNewPassword: true };
            }
            setToken(result.accessToken);
            const decoded = _decodeUser(result.idToken || result.accessToken);
            setUser({ ...decoded, email: decoded.email || email });
            window.electronAPI.initSync?.(result.idToken || result.accessToken);
            // Populate buckets before navigating to dashboard
            try {
                await window.electronAPI.syncBucketsNow?.();
            } catch (e) {
                console.warn('[AuthContext] Initial bucket sync failed:', e);
            }
            navigate('/');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message || 'An unexpected error occurred' };
        }
    };

    /**
     * Submit a new password after NEW_PASSWORD_REQUIRED challenge.
     */
    const submitNewPassword = async (newPassword) => {
        try {
            const result = await window.electronAPI.auth.newPassword(
                challengeUsername,
                newPassword,
                challengeSession,
            );
            if (!result.success) {
                return { success: false, error: result.error || 'Failed to set new password' };
            }
            setToken(result.accessToken);
            const decoded = _decodeUser(result.idToken || result.accessToken);
            setUser({ ...decoded, email: decoded.email || challengeUsername });
            setRequiresNewPassword(false);
            setChallengeSession(null);
            setChallengeUsername(null);
            window.electronAPI.initSync?.(result.idToken || result.accessToken);
            // Populate buckets before navigating
            try {
                await window.electronAPI.syncBucketsNow?.();
            } catch (e) {
                console.warn('[AuthContext] Initial bucket sync failed:', e);
            }
            navigate('/');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    };

    /**
     * Bot handshake login — calls the IPC bot:handshake handler which
     * signs a JWT with the local private key and exchanges it for tokens.
     */
    const loginAsBot = async (botId) => {
        try {
            const result = await window.electronAPI.bot.handshake(botId);
            if (!result.success) {
                return { success: false, error: result.error || 'Handshake failed' };
            }
            setToken(result.accessToken);
            setIsBot(true);
            // Decode botName from HS256 JWT payload (safe — not verifying, just reading)
            let resolvedBotName = result.botName || 'Service Agent';
            try {
                const p = JSON.parse(atob(result.accessToken.split('.')[1]));
                if (p.botName) resolvedBotName = p.botName;
            } catch {}
            setBotName(resolvedBotName);
            setUser({ email: result.email, username: result.email, name: resolvedBotName, sub: botId });
            window.electronAPI.initSync?.(result.accessToken);
            navigate('/');
            window.electronAPI.syncBucketsNow?.().catch(e => console.warn('[AuthContext] Bot bucket sync failed (non-fatal):', e));
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message || 'Bot login failed' };
        }
    };

    const logout = async () => {
        await window.electronAPI?.auth?.logout?.();
        window.electronAPI?.stopSync?.();
        _clearState();
        navigate('/login');
    };

    const value = {
        token,
        user,
        login,
        loginAsBot,
        logout,
        submitNewPassword,
        isAuthenticated: !!token,
        loading,
        requiresNewPassword,
        challengeUsername,
        session: challengeSession,
        isBot,
        botName,
        isAutoLogin,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

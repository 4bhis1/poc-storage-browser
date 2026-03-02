
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
    tenantName?: string;
    policies?: any[];
    teams?: any[];
}

interface AuthContextType {
    user: User | null;
    login: (token: string, userData: User, redirectPath?: string) => void;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    login: () => { },
    logout: () => { },
    loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const logout = useCallback(async () => {
        // Clear server-side httpOnly cookies
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (_) { /* best-effort */ }

        // Clear client-side storage
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
        setUser(null);
        router.push('/login');
    }, [router]);

    // Attempt a silent token refresh using the httpOnly refreshToken cookie.
    // Returns the new accessToken string on success, or null on failure.
    const tryRefresh = useCallback(async (): Promise<string | null> => {
        try {
            const res = await fetch('/api/auth/refresh', { method: 'POST' });
            if (!res.ok) return null;
            const data = await res.json();
            return data.accessToken ?? null;
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        async function initAuth() {
            const storedToken = localStorage.getItem('accessToken');
            const storedUser = localStorage.getItem('user');

            if (storedToken && storedUser) {
                try {
                    const decoded: any = jwtDecode(storedToken);
                    const isExpired = decoded.exp * 1000 < Date.now();

                    if (!isExpired) {
                        const parsedUser = JSON.parse(storedUser);
                        setUser(parsedUser);

                        // Silently refresh user data (including new policies/teams) in background
                        fetch('/api/auth/me')
                            .then(res => res.ok ? res.json() : null)
                            .then(data => {
                                if (data && data.email) {
                                    setUser(data);
                                    localStorage.setItem('user', JSON.stringify(data));
                                }
                            })
                            .catch(() => {});

                        // Schedule a proactive refresh ~1 minute before expiry
                        const msUntilExpiry = decoded.exp * 1000 - Date.now();
                        const refreshIn = Math.max(msUntilExpiry - 60_000, 0);
                        const timer = setTimeout(async () => {
                            const newToken = await tryRefresh();
                            if (newToken) {
                                localStorage.setItem('accessToken', newToken);
                            } else {
                                await logout();
                            }
                        }, refreshIn);
                        setLoading(false);
                        return () => clearTimeout(timer);
                    }

                    // Token expired — try refresh
                    const newToken = await tryRefresh();
                    if (newToken) {
                        localStorage.setItem('accessToken', newToken);
                        setUser(JSON.parse(storedUser));
                    } else {
                        localStorage.removeItem('accessToken');
                        localStorage.removeItem('user');
                        router.push('/login');
                    }
                } catch {
                    // Malformed token — try refresh as a fallback
                    const newToken = await tryRefresh();
                    if (!newToken) {
                        localStorage.removeItem('accessToken');
                        localStorage.removeItem('user');
                        router.push('/login');
                    }
                }
            } else {
                // No localStorage — check if server httpOnly cookie still has a valid session
                try {
                    const res = await fetch('/api/auth/me');
                    if (res.ok) {
                        const userData = await res.json();
                        // Hydrate user from server — don't set localStorage here
                        // (login page will do that on next explicit login)
                        setUser(userData);
                    }
                    // If 401, user is simply not logged in — stay null, proxy will redirect
                } catch { /* network error — stay null */ }
            }

            setLoading(false);
        }

        initAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const login = (token: string, userData: User, redirectPath: string = '/') => {
        // Store token client-side for JWT decode / expiry checks
        localStorage.setItem('accessToken', token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        // Note: the login API already set accessToken + refreshToken as httpOnly cookies
        window.location.href = redirectPath;
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);

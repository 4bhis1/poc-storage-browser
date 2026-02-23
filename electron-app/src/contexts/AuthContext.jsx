
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('accessToken'));
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        // Hydrate token
        const storedToken = localStorage.getItem('accessToken');
        if (storedToken) {
            setToken(storedToken);
            // In a real app, verify token validity here or decode JWT
            // For now, we assume it's valid if present
            if (window.electronAPI) {
                 window.electronAPI.initSync(storedToken);
            }
        }
        setLoading(false);

        let cleanupAuthExpired = null;
        if (window.electronAPI) {
            cleanupAuthExpired = window.electronAPI.onAuthExpired(() => {
                console.warn("Authentication expired in backend. Logging out...");
                localStorage.removeItem('accessToken');
                setToken(null);
                setUser(null);
                navigate('/login');
            });
        }

        return () => {
            if (cleanupAuthExpired) cleanupAuthExpired();
        };
    }, [navigate]);

    const login = async (email, password) => {
        try {
            const response = await fetch('http://localhost:3000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, platform: "Agent" })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            const { accessToken, user: userData } = data;
            
            localStorage.setItem('accessToken', accessToken);
            setToken(accessToken);
            setUser(userData);
            
            // Initialize Sync Engine via IPC
            if (window.electronAPI) {
                window.electronAPI.initSync(accessToken);
            }
            
            navigate('/');
            return { success: true };
        } catch (error) {
            console.error(error);
            return { success: false, error: error.message };
        }
    };

    const logout = () => {
        localStorage.removeItem('accessToken');
        setToken(null);
        setUser(null);
        if (window.electronAPI) {
            window.electronAPI.stopSync();
        }
        navigate('/login');
    };

    const value = {
        token,
        user,
        login,
        logout,
        isAuthenticated: !!token,
        loading
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

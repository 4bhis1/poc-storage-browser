import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    // Placeholder for future authentication logic
    // Currently hardcoded as per the design mockup
    const [user, setUser] = useState({
        name: 'Admin User',
        role: 'IT Operations',
        avatar: null // Could be a URL
    });

    const [tenant, setTenant] = useState({
        id: 'tenant-123',
        name: 'Enterprise_Corp',
        plan: 'Premium'
    });

    const logout = () => {
        console.log("Logout logic here");
    };

    return (
        <AuthContext.Provider value={{ user, tenant, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

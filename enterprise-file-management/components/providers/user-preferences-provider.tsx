'use client'

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useAuth } from './AuthProvider';

type ThemePreferences = {
  themeMode: string;
  themeColor: string;
  themeFont: string;
  themeRadius: string;
};

type UserPreferencesContextType = ThemePreferences & {
  setPreferences: (prefs: Partial<ThemePreferences>) => Promise<void>;
  isLoading: boolean;
};

const defaultPreferences: ThemePreferences = {
  themeMode: 'dark',
  themeColor: 'blue',
  themeFont: 'inter',
  themeRadius: '0.3',
};

const UserPreferencesContext = createContext<UserPreferencesContextType>({
  ...defaultPreferences,
  setPreferences: async () => {},
  isLoading: true,
});

export function UserPreferencesProvider({ 
  children,
  initialPreferences,
}: { 
  children: React.ReactNode;
  initialPreferences?: ThemePreferences;
}) {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  
  // Use initialPreferences if provided (from SSR in layout), fallback to defaults
  const [preferences, setPreferencesState] = useState<ThemePreferences>(
    initialPreferences || defaultPreferences
  );
  // Set isLoading to false initially since we already have the state from SSR
  const [isLoading, setIsLoading] = useState(false);

  const isInitialized = React.useRef(false);

  // We no longer fetch from the client on mount if SSR gave us the values,
  // preventing the FOUC. We still need to apply them on mount if we want to ensure
  // DOM matches standard, though SSR layout should have set the classes already.
  useEffect(() => {
    // If the user logs out, reset to default instantly.
    if (!user && !initialPreferences) {
      setPreferencesState(defaultPreferences);
      applyPreferences(defaultPreferences);
    } else if (user && !initialPreferences && !isInitialized.current) {
        isInitialized.current = true;
        // Fallback fetch in case this provider is ever mounted independently
        setIsLoading(true);
        fetch('/api/user/preferences')
          .then((res) => {
            if (res.ok) return res.json();
            throw new Error('Failed to fetch preferences');
          })
          .then((data) => {
            const loadedPrefs = {
              themeMode: data.themeMode || defaultPreferences.themeMode,
              themeColor: data.themeColor || defaultPreferences.themeColor,
              themeFont: data.themeFont || defaultPreferences.themeFont,
              themeRadius: data.themeRadius || defaultPreferences.themeRadius,
            };
            setPreferencesState(loadedPrefs);
            applyPreferences(loadedPrefs);
          })
          .catch((error) => console.error('Error loading preferences:', error))
          .finally(() => setIsLoading(false));
    } else if (initialPreferences && !isInitialized.current) {
        isInitialized.current = true;
        // Just apply what SSR gave us to make sure Next Themes is in sync
        if (initialPreferences.themeMode) {
          setTheme(initialPreferences.themeMode);
        }
    }
  }, [user, initialPreferences, setTheme]);

  const applyPreferences = (prefs: ThemePreferences) => {
    // Mode
    setTheme(prefs.themeMode);

    // Apply color, font, radius to document element
    const root = document.documentElement;

    // Clear previous theme classes
    root.className = root.className.replace(/\btheme-\S+/g, '');
    root.className = root.className.replace(/\bfont-\S+/g, '');
    root.className = root.className.replace(/\bradius-\S+/g, '');
    root.className = root.className.replace(/\s+/g, ' ').trim();

    // Add new classes
    root.classList.add(`theme-${prefs.themeColor}`);
    root.classList.add(`font-${prefs.themeFont}`);
    
    // For radius, we might translate 0.3 to '0-3' to avoid dots in classes
    const radiusClass = `radius-${prefs.themeRadius.replace('.', '-')}`;
    root.classList.add(radiusClass);
  };

  const setPreferences = async (newPrefs: Partial<ThemePreferences>) => {
    const updatedPrefs = { ...preferences, ...newPrefs };
    setPreferencesState(updatedPrefs);
    applyPreferences(updatedPrefs);

    if (user) {
      try {
        await fetch('/api/user/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPrefs),
        });
      } catch (error) {
        console.error('Failed to save preferences:', error);
      }
    }
  };

  return (
    <UserPreferencesContext.Provider value={{ ...preferences, setPreferences, isLoading }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}

export const useUserPreferences = () => useContext(UserPreferencesContext);

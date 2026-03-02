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

export function UserPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const [preferences, setPreferencesState] = useState<ThemePreferences>(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
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
    } else {
      setIsLoading(false);
      applyPreferences(defaultPreferences);
    }
  }, [user]);

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

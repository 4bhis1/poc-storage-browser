'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useUserPreferences } from '@/components/providers/user-preferences-provider'
import { Button } from '@/components/ui/button'

const colors = [
  { name: 'Zinc', value: 'zinc', class: 'bg-zinc-500' },
  { name: 'Slate', value: 'slate', class: 'bg-slate-500' },
  { name: 'Stone', value: 'stone', class: 'bg-stone-500' },
  { name: 'Red', value: 'red', class: 'bg-red-500' },
  { name: 'Orange', value: 'orange', class: 'bg-orange-500' },
  { name: 'Green', value: 'green', class: 'bg-green-500' },
  { name: 'Blue', value: 'blue', class: 'bg-blue-500' },
  { name: 'Rose', value: 'rose', class: 'bg-rose-500' },
  { name: 'Violet', value: 'violet', class: 'bg-violet-500' },
  { name: 'Yellow', value: 'yellow', class: 'bg-yellow-500' },
];

const fonts = [
  { name: 'Inter', value: 'inter' },
  { name: 'Manrope', value: 'manrope' },
  { name: 'System', value: 'system' },
];

const radiuses = ['0', '0.3', '0.5', '0.75', '1'];

export function AppearanceSettings() {
  const { themeMode, themeColor, themeFont, themeRadius, setPreferences } = useUserPreferences();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Theme Preferences</CardTitle>
          <CardDescription>
            Customize the look and feel of the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          
          {/* Mode */}
          <div className="space-y-3">
            <Label>Mode</Label>
            <div className="flex flex-wrap gap-3">
              {['light', 'dark', 'system'].map((mode) => (
                <Button
                  key={mode}
                  variant={themeMode === mode ? 'default' : 'outline'}
                  className="w-24 capitalize"
                  onClick={() => setPreferences({ themeMode: mode })}
                >
                  {themeMode === mode && <Check className="mr-2 h-4 w-4" />}
                  {mode}
                </Button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-3">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-3">
              {colors.map((color) => (
                <Button
                  key={color.value}
                  variant={themeColor === color.value ? 'default' : 'outline'}
                  className="w-28 flex items-center justify-start gap-2 px-3"
                  onClick={() => setPreferences({ themeColor: color.value })}
                >
                  <span className={`flex h-4 w-4 shrink-0 rounded-full ${color.class} border border-black/10 dark:border-white/10`} />
                  <span className="flex-1 text-left">{color.name}</span>
                  {themeColor === color.value && <Check className="h-4 w-4 shrink-0" />}
                </Button>
              ))}
            </div>
          </div>

          {/* Font */}
          <div className="space-y-3">
            <Label>Font</Label>
            <div className="flex flex-wrap gap-3">
              {fonts.map((font) => (
                <Button
                  key={font.value}
                  variant={themeFont === font.value ? 'default' : 'outline'}
                  className="w-28"
                  style={{ fontFamily: font.value === 'inter' ? 'var(--font-inter)' : font.value === 'manrope' ? 'var(--font-manrope)' : 'inherit' }}
                  onClick={() => setPreferences({ themeFont: font.value })}
                >
                  {themeFont === font.value && <Check className="mr-2 h-4 w-4" />}
                  {font.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Radius */}
          <div className="space-y-3">
            <Label>Radius</Label>
            <div className="flex flex-wrap gap-3">
              {radiuses.map((radius) => (
                <Button
                  key={radius}
                  variant={themeRadius === radius ? 'default' : 'outline'}
                  className="w-20"
                  onClick={() => setPreferences({ themeRadius: radius })}
                >
                  {themeRadius === radius && <Check className="mr-2 h-4 w-4" />}
                  {radius}
                </Button>
              ))}
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}

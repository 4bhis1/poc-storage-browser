'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [newPassword, setNewPassword] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState('');
    const [requiresNewPassword, setRequiresNewPassword] = React.useState(false);
    const [session, setSession] = React.useState('');
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        
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
                        localStorage.setItem('accessToken', data.accessToken);
                        localStorage.setItem('user', JSON.stringify({
                            id: data.id || '',
                            email,
                            name: data.name || email.split('@')[0],
                            role: data.role,
                            tenantId: data.tenantId || '',
                            tenantName: data.tenantName || '',
                        }));
                    }
                    if (data.role === 'PLATFORM_ADMIN') {
                        router.push('/superadmin');
                    } else {
                        router.push('/');
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
                            localStorage.setItem('accessToken', data.accessToken);
                            localStorage.setItem('user', JSON.stringify({
                                id: data.id || '',
                                email,
                                name: data.name || email.split('@')[0],
                                role: data.role,
                                tenantId: data.tenantId || '',
                                tenantName: data.tenantName || '',
                            }));
                        }
                        if (data.role === 'PLATFORM_ADMIN') {
                            router.push('/superadmin');
                        } else {
                            router.push('/');
                        }
                    }
                } else {
                    setError(data.error || 'Login failed');
                }
            }
        } catch(err) {
            setError('An error occurred during authentication');
        } finally {
            setLoading(false);
        }
    };


    return (
        <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold tracking-tight text-center">FMS Login</CardTitle>
                    <CardDescription className="text-center">Authenticate strictly via corporate credentials.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input 
                                id="email" 
                                type="email" 
                                placeholder="Admin@fms.com" 
                                value={email} 
                                onChange={e => setEmail(e.target.value)} 
                                required 
                                disabled={requiresNewPassword}
                            />
                        </div>
                        {!requiresNewPassword ? (
                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input 
                                    id="password" 
                                    type="password" 
                                    placeholder="••••••••" 
                                    value={password} 
                                    onChange={e => setPassword(e.target.value)} 
                                    required 
                                />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="newPassword">New Password Required</Label>
                                <Input 
                                    id="newPassword" 
                                    type="password" 
                                    placeholder="Enter new password" 
                                    value={newPassword} 
                                    onChange={e => setNewPassword(e.target.value)} 
                                    required 
                                />
                                <p className="text-xs text-muted-foreground">
                                    Your account requires you to set a new password.
                                </p>
                            </div>
                        )}
                        {error && <div className="text-sm font-medium text-red-500 text-center">{error}</div>}
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Authenticating...' : (requiresNewPassword ? 'Update Password' : 'Sign In')}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

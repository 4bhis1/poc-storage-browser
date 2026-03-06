import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';

/**
 * DoctorGuard — Entry gate for auto-login scenarios.
 * 
 * Runs system diagnostics before allowing Dashboard access.
 * Only activates for auto-login events, not manual login.
 */
export default function DoctorGuard({ children, shouldActivate, onComplete }) {
    const [isRunning, setIsRunning] = useState(false);
    const [diagnostics, setDiagnostics] = useState([]);
    const [allPassed, setAllPassed] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        if (shouldActivate && !isRunning) {
            runDiagnostics();
        }
    }, [shouldActivate]);

    const runDiagnostics = async () => {
        setIsRunning(true);
        setDiagnostics([]);
        
        try {
            const results = await window.electronAPI.doctor.runDiagnostics();
            setDiagnostics(results);
            
            const passed = results.every(d => d.status === 'pass');
            setAllPassed(passed);
            
            if (passed) {
                // Auto-proceed after 2 seconds if all checks pass
                setTimeout(() => {
                    onComplete?.();
                }, 2000);
            }
        } catch (err) {
            console.error('[DoctorGuard] Diagnostics failed:', err);
            setDiagnostics([{
                name: 'System Check',
                status: 'fail',
                detail: 'Failed to run diagnostics: ' + err.message,
                durationMs: 0
            }]);
        } finally {
            setIsRunning(false);
        }
    };

    const handleProceed = () => {
        onComplete?.();
    };

    const handleGoToDoctor = () => {
        navigate('/doctor');
    };

    // If guard is not activated, render children normally
    if (!shouldActivate) {
        return children;
    }

    const getStatusIcon = (status) => {
        switch (status) {
            case 'pass': return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
            case 'warn': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
            case 'fail': return <XCircle className="h-5 w-5 text-red-600" />;
            default: return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pass': return 'border-emerald-200 bg-emerald-50';
            case 'warn': return 'border-yellow-200 bg-yellow-50';
            case 'fail': return 'border-red-200 bg-red-50';
            default: return 'border-blue-200 bg-blue-50';
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="max-w-2xl w-full space-y-6">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="flex justify-center">
                        <div className="bg-blue-100 p-4 rounded-full">
                            <Stethoscope className="h-8 w-8 text-blue-600" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">System Health Check</h1>
                    <p className="text-slate-600">
                        Verifying system readiness before starting sync operations
                    </p>
                </div>

                {/* Diagnostics Grid */}
                {diagnostics.length > 0 && (
                    <div className="grid gap-3">
                        {diagnostics.map((diagnostic, index) => (
                            <div
                                key={index}
                                className={`rounded-lg border-2 p-4 ${getStatusColor(diagnostic.status)}`}
                            >
                                <div className="flex items-center gap-3">
                                    {getStatusIcon(diagnostic.status)}
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-sm">{diagnostic.name}</h3>
                                        <p className="text-sm text-slate-600 mt-1">{diagnostic.detail}</p>
                                    </div>
                                    {diagnostic.durationMs > 0 && (
                                        <span className="text-xs text-slate-400">
                                            {diagnostic.durationMs}ms
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Loading State */}
                {isRunning && (
                    <div className="text-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
                        <p className="text-slate-600">Running system diagnostics...</p>
                    </div>
                )}

                {/* Actions */}
                {!isRunning && diagnostics.length > 0 && (
                    <div className="flex gap-3 justify-center">
                        {allPassed ? (
                            <div className="text-center space-y-3">
                                <div className="text-emerald-600 font-semibold">
                                    ✓ All systems operational
                                </div>
                                <Button onClick={handleProceed} className="px-8">
                                    Continue to Dashboard
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center space-y-3">
                                <div className="text-red-600 font-semibold">
                                    Issues detected — review required
                                </div>
                                <div className="flex gap-3 justify-center">
                                    <Button variant="outline" onClick={handleGoToDoctor}>
                                        View Details
                                    </Button>
                                    <Button onClick={handleProceed}>
                                        Proceed Anyway
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Retry */}
                {!isRunning && diagnostics.length > 0 && !allPassed && (
                    <div className="text-center">
                        <Button variant="ghost" size="sm" onClick={runDiagnostics}>
                            Run Diagnostics Again
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
"use client"

import * as React from "react"
import { Loader2, Minimize2, Maximize2, X, File, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useDownload } from "@/components/providers/download-provider"
import { cn } from "@/lib/utils"

export function GlobalDownloadIndicator() {
    const { files, isDownloading } = useDownload()
    const [isMinimized, setIsMinimized] = React.useState(false)
    const [isOpen, setIsOpen] = React.useState(false)

    React.useEffect(() => {
        if (isDownloading) {
            setIsOpen(true);
        }
    }, [isDownloading]);

    const activeFiles = files.filter(f => f.status === 'downloading' || f.status === 'pending')

    if (files.length === 0 || !isOpen) return null

    const progressSum = files.reduce((acc, f) => acc + f.progress, 0)
    const totalProgress = files.length > 0 ? Math.round(progressSum / files.length) : 0

    return (
        <div className={cn(
            "fixed bottom-4 left-4 z-50 bg-background border rounded-lg shadow-lg transition-all duration-300 overflow-hidden",
            isMinimized ? "w-64" : "w-80 sm:w-96"
        )}>
            {/* Header */}
            <div className="flex items-center justify-between p-3 bg-muted/50 border-b">
                <div className="flex items-center gap-2">
                    {isDownloading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    <span className="text-sm font-medium">
                        {isDownloading
                            ? `Downloading ${activeFiles.length} file${activeFiles.length !== 1 ? 's' : ''}`
                            : "Downloads complete"}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMinimized(!isMinimized)}>
                        {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
                    </Button>
                    {!isDownloading && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
                            <X className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Expanded Content */}
            {!isMinimized && (
                <div className="max-h-60 overflow-y-auto p-2 space-y-2">
                    {files.map(file => (
                        <div key={file.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                            <File className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm truncate font-medium">{file.name}</span>
                                    <span className="text-xs text-muted-foreground">{file.progress}%</span>
                                </div>
                                <Progress value={file.progress} className={cn("h-1",
                                    file.status === 'error' && "bg-destructive/20 [&>div]:bg-destructive",
                                    file.status === 'complete' && "bg-green-500/20 [&>div]:bg-green-500"
                                )} />
                            </div>
                            {file.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
                            {file.status === 'complete' && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
                        </div>
                    ))}
                </div>
            )}

            {/* Minimized Progress Bar */}
            {isMinimized && isDownloading && (
                <div className="p-2">
                    <Progress value={totalProgress} className="h-1" />
                </div>
            )}
        </div>
    )
}

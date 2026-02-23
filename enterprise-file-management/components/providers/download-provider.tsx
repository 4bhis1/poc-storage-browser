"use client"

import * as React from "react"
import { toast } from "sonner"
import { fetchWithAuth } from "@/lib/api"

export interface DownloadFile {
    id: string
    name: string
    progress: number
    status: "pending" | "downloading" | "complete" | "error"
    bucketId: string
    parentId: string | null
}

interface DownloadContextType {
    files: DownloadFile[]
    addDownloads: (files: { id: string, name: string, bucketId: string, parentId: string | null }[]) => void
    removeFile: (id: string) => void
    isDownloading: boolean
}

const DownloadContext = React.createContext<DownloadContextType | undefined>(undefined)

export function useDownload() {
    const context = React.useContext(DownloadContext)
    if (!context) {
        throw new Error("useDownload must be used within an DownloadProvider")
    }
    return context
}

export function DownloadProvider({ children }: { children: React.ReactNode }) {
    const [files, setFiles] = React.useState<DownloadFile[]>([])
    const [isProcessing, setIsProcessing] = React.useState(false)

    const addDownloads = (newFiles: { id: string, name: string, bucketId: string, parentId: string | null }[]) => {
        const downloadFiles: DownloadFile[] = newFiles.map((f, i) => ({
            id: `download-${f.id}-${Date.now()}-${i}`,
            name: f.name,
            progress: 0,
            status: "pending",
            bucketId: f.bucketId,
            parentId: f.parentId
        }))

        setFiles((prev) => [...prev, ...downloadFiles])
    }

    const removeFile = (id: string) => {
        setFiles((prev) => prev.filter((f) => f.id !== id))
    }

    React.useEffect(() => {
        if (isProcessing) return

        const pendingFile = files.find(f => f.status === 'pending')
        if (pendingFile) {
            processFile(pendingFile)
        }
    }, [files, isProcessing])

    const processFile = async (fileItem: DownloadFile) => {
        setIsProcessing(true)
        setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'downloading', progress: 50 } : f))

        try {
            const res = await fetchWithAuth(`/api/files/presigned?bucketId=${fileItem.bucketId}&name=${encodeURIComponent(fileItem.name)}&action=download&parentId=${fileItem.parentId || ''}`)
            if (res.ok) {
                const { url } = await res.json()
                if (url) {
                    // Trigger download
                    const a = document.createElement('a')
                    a.href = url
                    a.download = fileItem.name
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)

                    setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'complete', progress: 100 } : f))
                    toast.success(`Downloaded ${fileItem.name}`, { duration: 2000 })
                } else {
                    throw new Error('No URL returned')
                }
            } else {
                throw new Error('Failed to fetch presigned URL')
            }

        } catch (error) {
            console.error(error)
            setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'error', progress: 0 } : f))
            toast.error(`Failed to download ${fileItem.name}`, { duration: 2000 })
        } finally {
            setIsProcessing(false)
        }
    }

    const isDownloading = files.some(f => f.status === 'downloading' || f.status === 'pending')

    return (
        <DownloadContext.Provider value={{ files, addDownloads, removeFile, isDownloading }}>
            {children}
        </DownloadContext.Provider>
    )
}


"use client"

import * as React from "react"
import { toast } from "sonner"
import { fetchWithAuth } from "@/lib/api"

export interface UploadFile {
    id: string
    name: string
    size: number
    progress: number
    status: "pending" | "uploading" | "complete" | "error"
    file: File
    bucketId: string
    parentId: string | null
}

interface UploadContextType {
    files: UploadFile[]
    addFiles: (files: File[], bucketId: string, parentId: string | null) => void
    removeFile: (id: string) => void
    isUploading: boolean
}

const UploadContext = React.createContext<UploadContextType | undefined>(undefined)

export function useUpload() {
    const context = React.useContext(UploadContext)
    if (!context) {
        throw new Error("useUpload must be used within an UploadProvider")
    }
    return context
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
    const [files, setFiles] = React.useState<UploadFile[]>([])
    const [isProcessing, setIsProcessing] = React.useState(false)

    // Constants
    const PART_SIZE = 20 * 1024 * 1024; // 20MB
    const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB
    const CONCURRENCY = 3;

    const addFiles = (newFiles: File[], bucketId: string, parentId: string | null) => {
        const uploadFiles: UploadFile[] = newFiles.map((f, i) => ({
            id: `upload-${Date.now()}-${i}`,
            name: f.name,
            size: f.size,
            progress: 0,
            status: "pending",
            file: f,
            bucketId,
            parentId
        }))

        setFiles((prev) => [...prev, ...uploadFiles])
    }

    const removeFile = (id: string) => {
        setFiles((prev) => prev.filter((f) => f.id !== id))
    }

    // Effect to process the queue
    React.useEffect(() => {
        if (isProcessing) return

        const pendingFile = files.find(f => f.status === 'pending')
        if (pendingFile) {
            processFile(pendingFile)
        }
    }, [files, isProcessing])

    const processFile = async (fileItem: UploadFile) => {
        setIsProcessing(true)

        // Mark as uploading
        setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'uploading' } : f))

        try {
            if (fileItem.size >= MULTIPART_THRESHOLD) {
                await uploadMultipart(fileItem)
            } else {
                await uploadSimple(fileItem)
            }

            setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'complete', progress: 100 } : f))
            toast.success(`Uploaded ${fileItem.name}`, { duration: 2000 })

        } catch (error) {
            console.error(error)
            setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'error', progress: 0 } : f))
            toast.error(`Failed to upload ${fileItem.name}`, { duration: 2000 })
        } finally {
            setIsProcessing(false) // Trigger effect to pick up next file
        }
    }

    const uploadSimple = async (fileItem: UploadFile) => {
        // 1. Get Presigned URL
        const presignRes = await fetchWithAuth(`/api/files/presigned?bucketId=${fileItem.bucketId}&name=${encodeURIComponent(fileItem.name)}&parentId=${fileItem.parentId || ''}&contentType=${fileItem.file.type || 'application/octet-stream'}`)

        if (!presignRes.ok) throw new Error('Failed to get upload URL')

        const { url, key } = await presignRes.json()

        // 2. Upload to S3
        const uploadRes = await fetch(url, {
            method: 'PUT',
            body: fileItem.file,
            headers: {
                'Content-Type': fileItem.file.type || 'application/octet-stream'
            }
        })

        if (!uploadRes.ok) throw new Error('Failed to upload to S3')

        // 3. Create DB Record
        const dbRes = await fetchWithAuth('/api/files', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: fileItem.name,
                size: fileItem.size,
                mimeType: fileItem.file.type || 'application/octet-stream',
                bucketId: fileItem.bucketId,
                parentId: fileItem.parentId,
                isFolder: false,
                key: key
            })
        })

        if (!dbRes.ok) throw new Error('Failed to create file record')
    }

    const uploadMultipart = async (fileItem: UploadFile) => {
        const totalParts = Math.ceil(fileItem.size / PART_SIZE);

        // 1. Initiate Multipart
        const initRes = await fetchWithAuth('/api/files/multipart/initiate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bucketId: fileItem.bucketId,
                name: fileItem.name,
                type: fileItem.file.type,
                parentId: fileItem.parentId
            })
        });

        if (!initRes.ok) throw new Error('Failed to initiate multipart upload');
        const { uploadId, key } = await initRes.json();

        const parts: { ETag: string, PartNumber: number }[] = [];
        let completedParts = 0;

        const uploadPart = async (partNumber: number) => {
            const start = (partNumber - 1) * PART_SIZE;
            const end = Math.min(start + PART_SIZE, fileItem.size);
            const chunk = fileItem.file.slice(start, end);

            const signRes = await fetchWithAuth('/api/files/multipart/sign-part', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bucketId: fileItem.bucketId, key, uploadId, partNumber })
            });

            if (!signRes.ok) throw new Error(`Failed to sign part ${partNumber}`);
            const { url } = await signRes.json();

            const uploadRes = await fetch(url, {
                method: 'PUT',
                body: chunk
            });

            if (!uploadRes.ok) throw new Error(`Failed to upload part ${partNumber}`);

            const removeQuotes = (str: string) => str.replace(/^"|"$/g, '');
            const etag = removeQuotes(uploadRes.headers.get('ETag') || '');
            if (!etag) throw new Error(`No ETag for part ${partNumber}`);

            parts.push({ PartNumber: partNumber, ETag: etag });
            completedParts++;

            const percent = Math.round((completedParts / totalParts) * 100);
            setFiles(prev => prev.map(f => {
                if (f.id === fileItem.id) {
                    return { ...f, progress: percent };
                }
                return f;
            }));
        };

        const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);

        for (let i = 0; i < partNumbers.length; i += CONCURRENCY) {
            const batch = partNumbers.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(partNum => uploadPart(partNum)));
        }

        parts.sort((a, b) => a.PartNumber - b.PartNumber);

        const completeRes = await fetchWithAuth('/api/files/multipart/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bucketId: fileItem.bucketId,
                key,
                uploadId,
                parts,
                name: fileItem.name,
                size: fileItem.size,
                mimeType: fileItem.file.type,
                parentId: fileItem.parentId
            })
        });

        if (!completeRes.ok) throw new Error('Failed to complete multipart upload');
    }

    const isUploading = files.some(f => f.status === 'uploading' || f.status === 'pending')

    return (
        <UploadContext.Provider value={{ files, addFiles, removeFile, isUploading }}>
            {children}
        </UploadContext.Provider>
    )
}

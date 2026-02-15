'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface UploadedFile {
  url: string
  name: string
  size: number
  type: string
}

export interface UseFileUploadOptions {
  maxSizeMB?: number
  allowedTypes?: string[]
  bucket?: string
}

const DEFAULT_MAX_SIZE_MB = 10
const DEFAULT_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
  'text/plain',
  'application/zip'
]

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const {
    maxSizeMB = DEFAULT_MAX_SIZE_MB,
    allowedTypes = DEFAULT_ALLOWED_TYPES,
    bucket = 'chat-attachments'
  } = options

  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const validateFile = useCallback((file: File): string | null => {
    // Check file size
    const maxBytes = maxSizeMB * 1024 * 1024
    if (file.size > maxBytes) {
      return `File too large. Maximum size is ${maxSizeMB}MB.`
    }

    // Check file type
    if (!allowedTypes.includes(file.type)) {
      return `File type not allowed. Allowed types: ${allowedTypes.map(t => t.split('/')[1]).join(', ')}`
    }

    return null
  }, [maxSizeMB, allowedTypes])

  const uploadFile = useCallback(async (
    file: File,
    userId: string,
    conversationType: 'dm' | 'group',
    conversationId: string
  ): Promise<UploadedFile | null> => {
    setError(null)
    setProgress(0)

    // Validate the file
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return null
    }

    setUploading(true)

    try {
      // Generate unique filename with path: userId/conversationType/conversationId/timestamp-filename
      const timestamp = Date.now()
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const path = `${userId}/${conversationType}/${conversationId}/${timestamp}-${safeFileName}`

      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        throw uploadError
      }

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path)

      setProgress(100)

      return {
        url: publicUrl,
        name: file.name,
        size: file.size,
        type: file.type
      }
    } catch (err: any) {
      console.error('[useFileUpload] Error uploading file:', err)
      setError(err.message || 'Failed to upload file')
      return null
    } finally {
      setUploading(false)
    }
  }, [bucket, supabase, validateFile])

  const uploadMultiple = useCallback(async (
    files: File[],
    userId: string,
    conversationType: 'dm' | 'group',
    conversationId: string
  ): Promise<UploadedFile[]> => {
    const results: UploadedFile[] = []

    for (const file of files) {
      const result = await uploadFile(file, userId, conversationType, conversationId)
      if (result) {
        results.push(result)
      }
    }

    return results
  }, [uploadFile])

  const reset = useCallback(() => {
    setError(null)
    setProgress(0)
    setUploading(false)
  }, [])

  return {
    uploadFile,
    uploadMultiple,
    uploading,
    progress,
    error,
    reset,
    validateFile,
    maxSizeMB,
    allowedTypes
  }
}

// Helper to check if a file is an image
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

// Helper to create a preview URL for images
export function createImagePreview(file: File): string | null {
  if (!isImageFile(file)) return null
  return URL.createObjectURL(file)
}

// Helper to revoke preview URL (call when done with preview)
export function revokeImagePreview(url: string): void {
  URL.revokeObjectURL(url)
}

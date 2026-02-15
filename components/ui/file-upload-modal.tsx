'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Upload, File, Image as ImageIcon, Loader2 } from 'lucide-react'
import { useFileUpload, isImageFile, createImagePreview, revokeImagePreview } from '@/lib/hooks/use-file-upload'

interface FileUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onUploadComplete: (url: string, fileName: string) => void
  userId: string
  conversationType: 'dm' | 'group'
  conversationId: string
}

interface FilePreview {
  file: File
  previewUrl: string | null
}

export function FileUploadModal({
  isOpen,
  onClose,
  onUploadComplete,
  userId,
  conversationType,
  conversationId
}: FileUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<FilePreview | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { uploadFile, uploading, error, reset, maxSizeMB, allowedTypes } = useFileUpload()

  // Clean up preview URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (selectedFile?.previewUrl) {
        revokeImagePreview(selectedFile.previewUrl)
      }
    }
  }, [selectedFile])

  const handleFileSelect = useCallback((file: File) => {
    // Clean up old preview
    if (selectedFile?.previewUrl) {
      revokeImagePreview(selectedFile.previewUrl)
    }

    const previewUrl = isImageFile(file) ? createImagePreview(file) : null
    setSelectedFile({ file, previewUrl })
    reset()
  }, [selectedFile, reset])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }, [handleFileSelect])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    const result = await uploadFile(
      selectedFile.file,
      userId,
      conversationType,
      conversationId
    )

    if (result) {
      onUploadComplete(result.url, result.name)
      handleClose()
    }
  }

  const handleClose = () => {
    if (selectedFile?.previewUrl) {
      revokeImagePreview(selectedFile.previewUrl)
    }
    setSelectedFile(null)
    reset()
    onClose()
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Upload File</h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${dragOver
                ? 'border-blue-600 bg-blue-600/5'
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleInputChange}
              accept={allowedTypes.join(',')}
              className="hidden"
            />

            {selectedFile ? (
              <div className="space-y-3">
                {selectedFile.previewUrl ? (
                  <div className="relative mx-auto w-32 h-32 rounded-lg overflow-hidden">
                    <img
                      src={selectedFile.previewUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="mx-auto w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
                    <File className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900 truncate max-w-[200px] mx-auto">
                    {selectedFile.file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(selectedFile.file.size)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (selectedFile.previewUrl) {
                      revokeImagePreview(selectedFile.previewUrl)
                    }
                    setSelectedFile(null)
                    reset()
                  }}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">
                  Drop a file here or click to browse
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Max {maxSizeMB}MB - Images, PDF, Text, ZIP
                </p>
              </>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={uploading}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-[#04527a] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

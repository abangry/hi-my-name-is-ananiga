'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Upload, File, Loader2 } from 'lucide-react'
import { useFileUpload, isImageFile, isVideoFile, revokeImagePreview, UploadedFile } from '@/lib/hooks/use-file-upload'

interface FileUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onUploadComplete: (uploads: UploadedFile[]) => void
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
  const [selectedFiles, setSelectedFiles] = useState<FilePreview[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { uploadMultiple, uploading, error, reset, maxSizeMB, allowedTypes } = useFileUpload()

  // Revoke all blob preview URLs on unmount
  useEffect(() => {
    return () => {
      selectedFiles.forEach(f => { if (f.previewUrl) revokeImagePreview(f.previewUrl) })
    }
  }, [selectedFiles])

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    const previews: FilePreview[] = arr.map(file => ({
      file,
      previewUrl: (isImageFile(file) || isVideoFile(file)) ? URL.createObjectURL(file) : null
    }))
    setSelectedFiles(prev => [...prev, ...previews])
    reset()
  }, [reset])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files)
    // Reset input so selecting same files again works
    e.target.value = ''
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false) }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => {
      const f = prev[index]
      if (f.previewUrl) revokeImagePreview(f.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleUpload = async () => {
    if (!selectedFiles.length) return
    const results = await uploadMultiple(
      selectedFiles.map(f => f.file),
      userId,
      conversationType,
      conversationId
    )
    if (results.length > 0) {
      onUploadComplete(results)
      handleClose()
    }
  }

  const handleClose = () => {
    selectedFiles.forEach(f => { if (f.previewUrl) revokeImagePreview(f.previewUrl) })
    setSelectedFiles([])
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
          <h2 className="text-lg font-semibold text-gray-900">
            Upload Files {selectedFiles.length > 0 && <span className="text-sm font-normal text-gray-500">({selectedFiles.length})</span>}
          </h2>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              dragOver ? 'border-blue-600 bg-blue-600/5' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleInputChange}
              accept={allowedTypes.join(',')}
              className="hidden"
            />
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">
              {selectedFiles.length > 0 ? 'Add more files' : 'Drop files here or click to browse'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Max {maxSizeMB}MB each · Images, Videos, PDF, Text, ZIP
            </p>
          </div>

          {/* Selected files preview grid */}
          {selectedFiles.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {selectedFiles.map((f, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
                  {f.previewUrl && isImageFile(f.file) ? (
                    <img src={f.previewUrl} alt={f.file.name} className="w-full h-full object-cover" />
                  ) : f.previewUrl && isVideoFile(f.file) ? (
                    <video src={f.previewUrl} className="w-full h-full object-cover" muted />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2 gap-1">
                      <File className="w-6 h-6 text-gray-400" />
                      <span className="text-[10px] text-gray-500 text-center truncate w-full px-1">{f.file.name}</span>
                    </div>
                  )}
                  {/* Size label */}
                  <span className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[9px] text-center py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {formatFileSize(f.file.size)}
                  </span>
                  {/* Remove button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 hover:bg-black/80 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
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
            disabled={selectedFiles.length === 0 || uploading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-[#04527a] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Uploading...</>
            ) : (
              <><Upload className="w-4 h-4" />{selectedFiles.length > 1 ? `Upload ${selectedFiles.length} files` : 'Upload'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

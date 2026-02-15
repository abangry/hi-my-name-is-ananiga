"use client"

import { useState } from "react"
import { X, User, Bell, Shield, Database, Palette } from "lucide-react"
import { ProfileSettingsPage } from "./settings/profile-settings-page"
import { Profile } from "@/lib/types/database.types"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  profile: Profile | null
}

type SettingsPage =
  | 'profile'
  | 'account'
  | 'notifications'
  | 'privacy'
  | 'data'
  | 'appearance'

const settingsPages = [
  { id: 'profile' as SettingsPage, label: 'My Profile', icon: User },
  { id: 'account' as SettingsPage, label: 'My Account', icon: Shield },
  { id: 'notifications' as SettingsPage, label: 'Notifications', icon: Bell },
  { id: 'privacy' as SettingsPage, label: 'Privacy & Safety', icon: Shield },
  { id: 'data' as SettingsPage, label: 'Data & Privacy', icon: Database },
  { id: 'appearance' as SettingsPage, label: 'Appearance', icon: Palette },
]

export function SettingsModal({ isOpen, onClose, profile }: SettingsModalProps) {
  const [currentPage, setCurrentPage] = useState<SettingsPage>('profile')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-4">
      {/* Modal - Full screen on mobile, modal on desktop */}
      <div className="relative w-full h-full sm:h-[90vh] sm:max-w-6xl bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col sm:flex-row">
        {/* Sidebar Navigation - Horizontal tabs on mobile, vertical on desktop */}
        <div className="sm:w-64 bg-gradient-to-b from-gray-50 to-white border-r border-gray-200 overflow-x-auto sm:overflow-y-auto sm:p-4">
          {/* Mobile tabs */}
          <div className="sm:hidden flex gap-2 p-2 overflow-x-auto border-b border-gray-200">
            {settingsPages.map((page) => {
              const Icon = page.icon
              return (
                <button
                  key={page.id}
                  onClick={() => setCurrentPage(page.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all duration-200 ${
                    currentPage === page.id
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                      : 'text-gray-600 bg-white hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <Icon size={16} />
                  <span className="whitespace-nowrap">{page.label}</span>
                </button>
              )
            })}
          </div>

          {/* Desktop sidebar */}
          <div className="hidden sm:block">
            <h2 className="text-xs font-bold text-gray-500 uppercase mb-4 px-2 tracking-wider">
              User Settings
            </h2>

            <nav className="space-y-1">
              {settingsPages.map((page) => {
                const Icon = page.icon
                return (
                  <button
                    key={page.id}
                    onClick={() => setCurrentPage(page.id)}
                    className={`w-full px-4 py-3 rounded-xl text-left flex items-center gap-3 transition-all duration-200 ${
                      currentPage === page.id
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-sm font-bold">{page.label}</span>
                  </button>
                )
              })}
            </nav>

            {/* Divider */}
            <div className="border-t border-gray-200 my-4" />

            {/* Logout / Close */}
            <button
              onClick={onClose}
              className="w-full px-4 py-3 rounded-xl text-left flex items-center gap-3 text-red-600 hover:bg-red-50 transition-all duration-200 font-bold"
            >
              <X size={18} />
              <span className="text-sm">Close Settings</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-br from-gray-50 to-white">
          {/* Close Button - Always visible on mobile */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10 p-2 rounded-xl bg-white hover:bg-gray-100 transition-all duration-200 shadow-md border border-gray-200"
          >
            <X size={18} className="text-gray-600 sm:w-5 sm:h-5" />
          </button>

          {/* Content */}
          <div className="p-4 sm:p-8">
            {currentPage === 'profile' && <ProfileSettingsPage profile={profile} />}
            {currentPage === 'account' && <AccountPlaceholder />}
            {currentPage === 'notifications' && <NotificationsPlaceholder />}
            {currentPage === 'privacy' && <PrivacyPlaceholder />}
            {currentPage === 'data' && <DataPlaceholder />}
            {currentPage === 'appearance' && <AppearancePlaceholder />}
          </div>
        </div>
      </div>
    </div>
  )
}

// Placeholder components for other settings pages
function AccountPlaceholder() {
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Account</h1>
        <p className="text-gray-500">Manage your account settings</p>
      </div>
      <div className="p-12 bg-white rounded-2xl text-center border-2 border-gray-200 shadow-sm">
        <div className="inline-block p-4 bg-blue-50 rounded-full mb-4">
          <Shield className="w-8 h-8 text-blue-600" />
        </div>
        <p className="text-gray-500 font-medium">Coming soon...</p>
      </div>
    </div>
  )
}

function NotificationsPlaceholder() {
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Notifications</h1>
        <p className="text-gray-500">Configure your notification preferences</p>
      </div>
      <div className="p-12 bg-white rounded-2xl text-center border-2 border-gray-200 shadow-sm">
        <div className="inline-block p-4 bg-blue-50 rounded-full mb-4">
          <Bell className="w-8 h-8 text-blue-600" />
        </div>
        <p className="text-gray-500 font-medium">Coming soon...</p>
      </div>
    </div>
  )
}

function PrivacyPlaceholder() {
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy & Safety</h1>
        <p className="text-gray-500">Control your privacy settings</p>
      </div>
      <div className="p-12 bg-white rounded-2xl text-center border-2 border-gray-200 shadow-sm">
        <div className="inline-block p-4 bg-blue-50 rounded-full mb-4">
          <Shield className="w-8 h-8 text-blue-600" />
        </div>
        <p className="text-gray-500 font-medium">Coming soon...</p>
      </div>
    </div>
  )
}

function DataPlaceholder() {
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Data & Privacy</h1>
        <p className="text-gray-500">Manage your data and download your information</p>
      </div>
      <div className="p-12 bg-white rounded-2xl text-center border-2 border-gray-200 shadow-sm">
        <div className="inline-block p-4 bg-blue-50 rounded-full mb-4">
          <Database className="w-8 h-8 text-blue-600" />
        </div>
        <p className="text-gray-500 font-medium">Coming soon...</p>
      </div>
    </div>
  )
}

function AppearancePlaceholder() {
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Appearance</h1>
        <p className="text-gray-500">Customize how your app looks</p>
      </div>
      <div className="p-12 bg-white rounded-2xl text-center border-2 border-gray-200 shadow-sm">
        <div className="inline-block p-4 bg-blue-50 rounded-full mb-4">
          <Palette className="w-8 h-8 text-blue-600" />
        </div>
        <p className="text-gray-500 font-medium">Coming soon...</p>
      </div>
    </div>
  )
}

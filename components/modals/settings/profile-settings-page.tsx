"use client"

import { useState, useRef, useEffect } from "react"
import { Camera, Upload, X, Save, LogOut, Sun, Moon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Profile } from "@/lib/types/database.types"
import { useRouter } from "next/navigation"
import { wsManager } from "@/lib/websocket-manager"

interface ProfileSettingsPageProps {
  profile: Profile | null
}

interface ExtendedProfile extends Profile {
  bio?: string
  banner_url?: string
  profile_theme?: 'light' | 'dark'
}

export function ProfileSettingsPage({ profile: initialProfile }: ProfileSettingsPageProps) {
  const router = useRouter()
  const [profile, setProfile] = useState<ExtendedProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const [profileTheme, setProfileTheme] = useState<'light' | 'dark'>('light')

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // grab all the profile fields when the component loads
  useEffect(() => {
    const loadProfile = async () => {
      if (!initialProfile?.id) return

      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', initialProfile.id)
        .single()

      if (error) {
        console.error('[ProfileSettings] Error loading profile:', error)
      } else if (data) {
        setProfile(data)
        setDisplayName(data.display_name || '')
        setBio(data.bio || '')
        setAvatarPreview(data.avatar_url || null)
        setBannerPreview(data.banner_url || null)
        setProfileTheme(data.profile_theme || 'light')
      }
      setLoading(false)
    }

    loadProfile()
  }, [initialProfile, supabase])

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // don't let people upload huge files - kills the server
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Avatar must be less than 5MB' })
      return
    }

    // make sure it's actually an image lol
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Avatar must be an image' })
      return
    }

    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // banners can be a bit bigger since they're wider
    if (file.size > 8 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Banner must be less than 8MB' })
      return
    }

    // again, needs to be an image
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Banner must be an image' })
      return
    }

    setBannerFile(file)
    setBannerPreview(URL.createObjectURL(file))
  }

  const uploadFile = async (file: File, bucket: string, folder: string) => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${profile?.id}-${Date.now()}.${fileExt}`
    const filePath = `${folder}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)

    return publicUrl
  }

  const handleSave = async () => {
    if (!profile?.id) return

    setSaving(true)
    setMessage(null)

    try {
      let avatarUrl = profile.avatar_url
      let bannerUrl = profile.banner_url

      // upload new avatar if they picked one
      if (avatarFile) {
        avatarUrl = await uploadFile(avatarFile, 'avatars', 'user-avatars')
      }

      // upload new banner if they picked one
      if (bannerFile) {
        bannerUrl = await uploadFile(bannerFile, 'banners', 'user-banners')
      }

      // save everything to the database
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          avatar_url: avatarUrl,
          banner_url: bannerUrl,
          profile_theme: profileTheme
        })
        .eq('id', profile.id)

      if (error) throw error

      // Broadcast profile update to all connected clients for live sync
      wsManager.emitProfileUpdate({
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl ?? null,
        banner_url: bannerUrl ?? null,
        bio: bio.trim() || null,
        profile_theme: profileTheme
      })

      setMessage({ type: 'success', text: 'Profile updated successfully!' })

      // reset the file pickers
      setAvatarFile(null)
      setBannerFile(null)

      // reload to show the new data
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profile.id)
        .single()

      if (updatedProfile) {
        setProfile(updatedProfile)
      }
    } catch (error: any) {
      console.error('[ProfileSettings] Save error:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await supabase.auth.signOut()
      router.push('/login')
    } catch (error) {
      console.error('[ProfileSettings] Sign out error:', error)
      setMessage({ type: 'error', text: 'Failed to sign out' })
    } finally {
      setSigningOut(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
        <p>Loading profile settings...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>Failed to load profile</p>
      </div>
    )
  }

  const hasChanges =
    displayName !== (profile.display_name || '') ||
    bio !== (profile.bio || '') ||
    avatarFile !== null ||
    bannerFile !== null ||
    profileTheme !== (profile.profile_theme || 'light')

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">My Profile</h1>
        <p className="text-gray-500">
          Customize your profile with a banner, avatar, and bio
        </p>
      </div>

      {/* success or error message after saving */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-xl shadow-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          <p className="font-medium">{message.text}</p>
        </div>
      )}

      {/* the big banner at the top of your profile */}
      <div className="mb-8">
        <label className="block text-sm font-bold text-gray-700 mb-3">
          Profile Banner
        </label>
        <div className="relative h-48 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl overflow-hidden group shadow-lg border border-gray-200">
          {bannerPreview && (
            <img
              src={bannerPreview}
              alt="Banner"
              className="w-full h-full object-cover"
            />
          )}

          {/* shows buttons when you hover over the banner */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <button
              onClick={() => bannerInputRef.current?.click()}
              className="px-5 py-2.5 bg-white hover:bg-gray-100 text-gray-900 rounded-xl flex items-center gap-2 transition-all duration-200 shadow-lg font-semibold text-sm"
            >
              <Upload size={18} />
              {bannerPreview ? 'Change Banner' : 'Upload Banner'}
            </button>
            {bannerPreview && (
              <button
                onClick={() => {
                  setBannerFile(null)
                  setBannerPreview(null)
                }}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl flex items-center gap-2 transition-all duration-200 shadow-lg font-semibold text-sm"
              >
                <X size={18} />
                Remove
              </button>
            )}
          </div>

          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            onChange={handleBannerSelect}
            className="hidden"
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 font-medium">
          Recommended: 1200x400px, max 8MB
        </p>
      </div>

      {/* your profile pic */}
      <div className="mb-8">
        <label className="block text-sm font-bold text-gray-700 mb-3">
          Avatar
        </label>
        <div className="flex items-center gap-6">
          <div className="relative w-28 h-28 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-500 group shadow-lg border-4 border-white ring-2 ring-gray-200">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-white">
                {profile.username.charAt(0).toUpperCase()}
              </div>
            )}

            {/* camera icon appears when you hover */}
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <Camera size={28} className="text-white" />
            </button>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>

          <div>
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl mb-3 transition-all duration-200 shadow-md hover:shadow-lg font-semibold text-sm"
            >
              Change Avatar
            </button>
            <p className="text-xs text-gray-500 font-medium">
              Recommended: 512x512px, max 5MB
            </p>
          </div>
        </div>
      </div>

      {/* username with tag - can't change this one */}
      <div className="mb-6">
        <label className="block text-sm font-bold text-gray-700 mb-2">
          Username
        </label>
        <div className="px-4 py-3.5 bg-gray-100 rounded-xl text-gray-500 border-2 border-gray-200 font-medium">
          {profile.username}#{profile.tag || '0000'}
        </div>
        <p className="text-xs text-gray-500 mt-2 font-medium">
          Username cannot be changed
        </p>
      </div>

      {/* the name people see instead of your username */}
      <div className="mb-6">
        <label className="block text-sm font-bold text-gray-700 mb-2">
          Display Name
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter a display name"
          maxLength={32}
          className="w-full px-4 py-3.5 bg-white text-gray-900 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all duration-200 font-medium placeholder:text-gray-400"
        />
        <p className="text-xs text-gray-500 mt-2 font-medium">
          {displayName.length}/32 characters
        </p>
      </div>

      {/* the about me section on your profile */}
      <div className="mb-8">
        <label className="block text-sm font-bold text-gray-700 mb-2">
          About Me
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell us about yourself..."
          maxLength={190}
          rows={4}
          className="w-full px-4 py-3.5 bg-white text-gray-900 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none resize-none transition-all duration-200 font-medium placeholder:text-gray-400"
        />
        <p className="text-xs text-gray-500 mt-2 font-medium">
          {bio.length}/190 characters
        </p>
      </div>

      {/* Profile Theme Toggle */}
      <div className="mb-8">
        <label className="block text-sm font-bold text-gray-700 mb-3">
          Profile Theme
        </label>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setProfileTheme(profileTheme === 'light' ? 'dark' : 'light')}
            className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
              profileTheme === 'dark'
                ? 'bg-[#141414]'
                : 'bg-gray-300'
            }`}
          >
            <div
              className={`absolute top-1 w-6 h-6 rounded-full transition-all duration-300 flex items-center justify-center ${
                profileTheme === 'dark'
                  ? 'left-9 bg-black'
                  : 'left-1 bg-white'
              } shadow-md`}
            >
              {profileTheme === 'dark' ? (
                <Moon size={14} className="text-blue-400" />
              ) : (
                <Sun size={14} className="text-yellow-500" />
              )}
            </div>
          </button>
          <span className="text-sm font-medium text-gray-600">
            {profileTheme === 'dark' ? 'Dark profile' : 'Light profile'}
          </span>
        </div>

        {/* Live Preview */}
        <div className={`mt-4 rounded-xl overflow-hidden border-2 ${profileTheme === 'dark' ? 'border-[#1f1f1f]' : 'border-gray-200'} shadow-sm`}>
          {/* Mini Banner */}
          <div
            className="h-16"
            style={{
              backgroundImage: bannerPreview ? `url(${bannerPreview})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              background: bannerPreview ? undefined : 'linear-gradient(to right, #8b5cf6, #ec4899, #3b82f6)'
            }}
          />
          <div className={`px-4 pb-3 ${profileTheme === 'dark' ? 'bg-black' : 'bg-white'}`}>
            <div className="flex items-center gap-3 -mt-5">
              <div className={`w-10 h-10 rounded-full overflow-hidden border-2 ${profileTheme === 'dark' ? 'border-black' : 'border-white'} flex-shrink-0`}>
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white">
                    {profile.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="mt-5">
                <p className={`text-sm font-bold ${profileTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  {displayName || profile.username}
                </p>
                <p className={`text-xs ${profileTheme === 'dark' ? 'text-neutral-400' : 'text-gray-500'}`}>
                  {profile.username}#{profile.tag || '0000'}
                </p>
              </div>
            </div>
            {bio && (
              <div className={`mt-2 p-2 rounded-lg text-xs ${profileTheme === 'dark' ? 'bg-[#0a0a0a] text-neutral-300' : 'bg-gray-50 text-gray-600'}`}>
                {bio.length > 60 ? bio.slice(0, 60) + '...' : bio}
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2 font-medium">
          This changes how your profile card looks to other users
        </p>
      </div>

      {/* save and sign out buttons */}
      <div className="flex items-center justify-between gap-4 pt-6 border-t-2 border-gray-200">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all duration-200 bg-red-50 text-red-600 hover:bg-red-100 hover:shadow-md border-2 border-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <LogOut size={18} />
          {signingOut ? 'Signing Out...' : 'Sign Out'}
        </button>

        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all duration-200 shadow-md ${
            hasChanges && !saving
              ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white hover:shadow-lg hover:scale-105'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
          }`}
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

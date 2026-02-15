"use client";

import Link from "next/link";
import { Mail } from "lucide-react";

export default function ConfirmSignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-gray-900">
            ChatApp
          </Link>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
            <Mail className="w-8 h-8 text-blue-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Check your email
          </h1>

          <p className="text-gray-600 mb-6">
            We&apos;ve sent you a confirmation link to verify your email address.
            Please check your inbox and click the link to continue.
          </p>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">
              Didn&apos;t receive the email? Check your spam folder or try signing up again.
            </p>
          </div>

          <Link
            href="/auth"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

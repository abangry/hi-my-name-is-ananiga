"use client";

import Link from "next/link";
import { CheckCircle } from "lucide-react";

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-gray-900">
            ChatApp
          </Link>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Welcome aboard!
          </h1>

          <p className="text-gray-600 mb-8">
            Your email has been confirmed and your account is ready to use.
            Let&apos;s get you started!
          </p>

          <Link
            href="/@me"
            className="block w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors text-center"
          >
            Continue to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

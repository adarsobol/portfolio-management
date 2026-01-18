import { useState } from 'react';
import { Loader2, AlertCircle, Briefcase } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { GoogleLogin } from '@react-oauth/google';

export function LoginPage() {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSuccess = async (credentialResponse: any) => {
    setError('');
    setIsLoading(true);
    try {
      if (credentialResponse.credential) {
        await loginWithGoogle(credentialResponse.credential);
      }
    } catch (err) {
      let errorMessage = 'Google login failed';
      if (err instanceof Error) {
        errorMessage = err.message;
        // Provide helpful error messages for common issues
        if (err.message.includes('CORS') || err.message.includes('Access-Control')) {
          errorMessage = 'CORS error: Please ensure your domain is authorized in Google Cloud Console OAuth settings';
        } else if (err.message.includes('401') || err.message.includes('Unauthorized')) {
          errorMessage = 'Authentication failed: Please check OAuth configuration';
        }
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 bg-blue-600 rounded-xl shadow-lg">
            <Briefcase className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-2">
            Portfolio Manager
          </h1>
          <p className="text-slate-600 text-sm">Sign in to manage your initiatives</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 mb-6">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <div className="flex items-center justify-center gap-3 p-4 mb-6">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span className="text-slate-600 font-medium">Signing in...</span>
            </div>
          )}

          {/* Google Login */}
          <div className="flex justify-center relative">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => {
                // GoogleLogin onError doesn't provide error details
                // Check console for specific error information
                setError('Google Login Failed: Please ensure your domain is authorized in Google Cloud Console OAuth settings. Check browser console for details.');
              }}
              theme="filled_black"
              shape="rectangular"
              width="100%"
              useOneTap={false}
            />
          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-center text-sm text-slate-500 font-medium">
              Contact your administrator if you need access
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

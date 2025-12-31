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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDI5M2EiIGZpbGwtb3BhY2l0eT0iMC40Ij48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLThoLTJ2LTRoMnY0em0tOCA4aC0ydi00aDJ2NHptMC04aC0ydi00aDJ2NHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20"></div>
      
      <div className="w-full max-w-md relative">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg shadow-blue-500/25 mb-4">
            <Briefcase className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Portfolio Manager</h1>
          <p className="text-slate-400">Sign in to manage your initiatives</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl border border-white/10 p-8">
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 mb-6">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <div className="flex items-center justify-center gap-3 p-4 mb-6">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <span className="text-slate-300">Signing in...</span>
            </div>
          )}

          {/* Google Login */}
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={(error) => {
                console.error('Google OAuth error:', error);
                if (error.type === 'popup_closed') {
                  setError('Login popup was closed');
                } else if (error.type === 'popup_failed_to_open') {
                  setError('Could not open login popup. Please check browser popup settings and ensure your domain is authorized in Google Cloud Console.');
                } else {
                  setError('Google Login Failed: Please ensure your domain is authorized in Google Cloud Console OAuth settings');
                }
              }}
              theme="filled_black"
              shape="rectangular"
              width="100%"
              useOneTap={false}
            />
          </div>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-slate-700/50">
            <p className="text-center text-sm text-slate-400">
              Contact your administrator if you need access
            </p>
          </div>
        </div>

        {/* Version */}
        <p className="text-center text-slate-600 text-xs mt-6">
          Portfolio Work Plan Manager v1.0
        </p>
      </div>
    </div>
  );
}

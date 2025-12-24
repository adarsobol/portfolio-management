import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { authService, AuthUser } from '../services/authService';
import { Role, User } from '../types';
import { logger } from '../utils/logger';
import { isGoogleOAuthConfigured } from '../config';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
  getAuthHeader: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // DEVELOPMENT MODE: Auto-login for local development when OAuth is not configured
  // This bypass will be disabled in production builds
  const isDevelopment = import.meta.env.DEV;
  
  const shouldUseDevBypass = isDevelopment && !isGoogleOAuthConfigured;
  
  const [user, setUser] = useState<User | null>(
    shouldUseDevBypass ? {
      id: 'u_as',
      email: 'adar.sobol@pagaya.com',
      name: 'Adar Sobol',
      role: Role.Admin,
      avatar: 'https://ui-avatars.com/api/?name=Adar+Sobol&background=10B981&color=fff'
    } : null
  );
  const [isLoading, setIsLoading] = useState(!shouldUseDevBypass);

  // Convert AuthUser to User type
  const convertToUser = (authUser: AuthUser): User => ({
    id: authUser.id,
    email: authUser.email,
    name: authUser.name,
    role: authUser.role as Role,
    avatar: authUser.avatar
  });

  // Check for existing authentication on mount (skip if using dev bypass)
  useEffect(() => {
    if (shouldUseDevBypass) {
      if (isDevelopment) {
        console.warn('⚠️ DEVELOPMENT MODE: Authentication bypassed. Set VITE_GOOGLE_CLIENT_ID to enable OAuth.');
      }
      setIsLoading(false);
      return;
    }

    const checkAuth = async () => {
      try {
        const authUser = await authService.getCurrentUser();
        if (authUser) {
          setUser(convertToUser(authUser));
        }
      } catch (error) {
        logger.debug('No existing auth session', { context: 'AuthContext.checkAuth' });
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [shouldUseDevBypass, isDevelopment]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await authService.login(email, password);
    setUser(convertToUser(response.user));
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    const response = await authService.loginWithGoogle(credential);
    setUser(convertToUser(response.user));
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
  }, []);

  const getAuthHeader = useCallback(() => {
    return authService.getAuthHeader();
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    loginWithGoogle,
    logout,
    getAuthHeader
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}


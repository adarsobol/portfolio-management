// Authentication Service - handles login, logout, and token management

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

class AuthService {
  private tokenKey = 'portfolio-auth-token';

  /**
   * Get stored auth token
   */
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  /**
   * Store auth token
   */
  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  /**
   * Remove auth token
   */
  removeToken(): void {
    localStorage.removeItem(this.tokenKey);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    // Check if token is expired
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const exp = payload.exp * 1000; // Convert to milliseconds
      return Date.now() < exp;
    } catch {
      return false;
    }
  }

  /**
   * Get authorization header
   */
  getAuthHeader(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Login with Google Credential
   */
  async loginWithGoogle(credential: string): Promise<LoginResponse> {
    const response = await fetch(`${API_ENDPOINT}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        credential,
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID 
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Google login failed');
    }

    const data = await response.json();
    this.setToken(data.token);
    return data;
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_ENDPOINT}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    this.setToken(data.token);
    return data;
  }

  /**
   * Logout - remove token
   */
  logout(): void {
    this.removeToken();
  }

  /**
   * Get current user from token
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    // DEVELOPMENT MODE: Return dev user if no Google OAuth configured
    const isDevelopment = import.meta.env.DEV;
    const hasGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID && 
                               import.meta.env.VITE_GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID';
    
    if (isDevelopment && !hasGoogleClientId) {
      // Return a mock user for development (bypasses token check)
      return {
        id: 'u_as',
        email: 'adar.sobol@pagaya.com',
        name: 'Adar Sobol',
        role: 'Admin',
        avatar: 'https://ui-avatars.com/api/?name=Adar+Sobol&background=10B981&color=fff'
      };
    }

    if (!this.isAuthenticated()) {
      return null;
    }

    try {
      const response = await fetch(`${API_ENDPOINT}/api/auth/me`, {
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeader()
        }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.removeToken();
        }
        return null;
      }

      const data = await response.json();
      return data.user;
    } catch {
      return null;
    }
  }

  /**
   * Register new user (admin only)
   */
  async registerUser(userData: {
    email: string;
    password: string;
    name: string;
    role: string;
    avatar?: string;
  }): Promise<AuthUser> {
    const response = await fetch(`${API_ENDPOINT}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader()
      },
      body: JSON.stringify(userData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    return data.user;
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await fetch(`${API_ENDPOINT}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader()
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Password change failed');
    }
  }

  /**
   * Get all users (for dropdowns)
   */
  async getUsers(): Promise<AuthUser[]> {
    const response = await fetch(`${API_ENDPOINT}/api/auth/users`, {
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeader()
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }

    const data = await response.json();
    return data.users;
  }
}

export const authService = new AuthService();


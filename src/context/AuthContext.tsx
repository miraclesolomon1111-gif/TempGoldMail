import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  auth,
  fetchFirestoreUserProfile,
  firebaseLogin,
  firebaseRegister,
  firebaseLogout,
  saveFirestoreForwarding
} from '../lib/firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: UserProfile | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<{ user: UserProfile; firebaseUser: FirebaseUser }>;
  register: (data: any) => Promise<{ user: UserProfile; firebaseUser: FirebaseUser }>;
  logout: () => Promise<void>;
  updateForwarding: (forwarding: { enabled: boolean; forwardTo: string; keepCopy?: boolean }) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 2. In AuthContext use ONLY onAuthStateChanged. Remove localStorage users loop and any localStorage.clear().
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        try {
          const profile = await fetchFirestoreUserProfile(fbUser.uid);
          if (profile) {
            setUser(profile);
          } else {
            // Self-repair user record
            const email = fbUser.email || '';
            const username = email.replace(/@.*$/, '') || 'user';
            const fallbackProfile: UserProfile = {
              id: fbUser.uid,
              email,
              username,
              name: username,
              role: 'user',
              created_at: new Date().toISOString(),
              forwarding_enabled: false,
              forwarding_email: '',
              forwarding: { enabled: false, forwardTo: '', keepCopy: true }
            } as any;
            setUser(fallbackProfile);
          }
        } catch (err) {
          console.warn("Error fetching user profile in onAuthStateChanged:", err);
        }
      } else {
        setFirebaseUser(null);
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (identifier: string, password: string) => {
    const res = await firebaseLogin(identifier, password);
    setUser(res.user);
    setFirebaseUser(res.firebaseUser);
    return res;
  };

  const register = async (data: any) => {
    const res = await firebaseRegister(data);
    setUser(res.user);
    setFirebaseUser(res.firebaseUser);
    return res;
  };

  const logout = async () => {
    await firebaseLogout();
    setUser(null);
    setFirebaseUser(null);
  };

  const updateForwarding = async (forwarding: { enabled: boolean; forwardTo: string; keepCopy?: boolean }) => {
    if (!firebaseUser) throw new Error("User must be signed in to update forwarding");
    await saveFirestoreForwarding(firebaseUser.uid, forwarding);
    setUser((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        forwarding_enabled: forwarding.enabled,
        forwarding_email: forwarding.forwardTo,
        forwarding: {
          enabled: forwarding.enabled,
          forwardTo: forwarding.forwardTo,
          keepCopy: forwarding.keepCopy !== false
        }
      };
    });
  };

  const refreshProfile = async () => {
    if (!firebaseUser) return;
    const profile = await fetchFirestoreUserProfile(firebaseUser.uid);
    if (profile) setUser(profile);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        loading,
        login,
        register,
        logout,
        updateForwarding,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

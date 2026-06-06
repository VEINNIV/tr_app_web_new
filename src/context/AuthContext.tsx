/**
 * TransLingua — AuthContext
 *
 * Kimlik doğrulama state'ini global olarak yönetir.
 * Supabase oturumu, kullanıcı profili ve yetki kontrollerini sağlar.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import type { User } from '../types';
import { isBanActive } from '../types';
import { AuthContext } from './auth';
export { useAuth } from './auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Profil fetch'in eş zamanlı birden fazla kez çalışmasını önle
  const fetchingRef = useRef(false);

  /**
   * Kullanıcı profilini Supabase'den çeker.
   * Hata durumunda konsola log yazar, profile null kalır.
   */
  const fetchProfile = async (userId: string): Promise<void> => {
    // Zaten fetch devam ediyorsa tekrar başlatma
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle(); // .single() yerine .maybeSingle() — 0 satır hata değil

      if (error) {
        console.error('[AuthContext] Profile fetch error:', error.message, error.details, error.hint);
        return;
      }

      if (data) {
        // Yasaklı kullanıcı: profili yükleme, oturumu kapat. (Sunucu tarafı zaten
        // begin_ai_operation içinde AI'yı engeller; bu UX katmanıdır.)
        if (isBanActive((data as User).banned_until)) {
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setProfile(null);
          const reason = (data as User).ban_reason;
          toast.error(
            reason
              ? `Hesabınız askıya alındı: ${reason}`
              : 'Hesabınız askıya alındı. Lütfen destek ile iletişime geçin.',
            { duration: 6000 },
          );
          return;
        }
        setProfile(data as User);
      } else {
        // Profil yok — trigger çalışmamış olabilir, elle oluştur
        console.warn('[AuthContext] No profile found for user, attempting to create...');
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              email: currentUser.email ?? '',
              full_name: currentUser.user_metadata?.full_name ?? currentUser.user_metadata?.name ?? '',
            })
            .select()
            .single();

          if (insertError) {
            // CONFLICT = profil zaten var, tekrar çek
            if (insertError.code === '23505') {
              const { data: retryData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();
              if (retryData) setProfile(retryData as User);
            } else {
              console.error('[AuthContext] Profile creation error:', insertError);
            }
          } else if (newProfile) {
            setProfile(newProfile as User);
          }
        }
      }
    } catch (err) {
      console.error('[AuthContext] Unexpected profile fetch error:', err);
    } finally {
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;

    // Supabase oturumunu başlat
    const init = async () => {
      try {
        const { data: { session: s }, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error('[AuthContext] getSession error:', error);
          setLoading(false);
          return;
        }

        setSession(s);
        setUser(s?.user ?? null);

        if (s?.user) {
          await fetchProfile(s.user.id);
        }
      } catch (err) {
        console.error('[AuthContext] init error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    // Auth durumu değiştiğinde güncelle
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!mounted) return;

      if (import.meta.env.DEV) {
        console.log('[AuthContext] Auth event:', event, s?.user?.id);
      }

      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        // INITIAL_SESSION'da init() zaten fetch yaptı
        if (event !== 'INITIAL_SESSION') {
          fetchingRef.current = false;
          fetchProfile(s.user.id); // await yok — arka planda çalışsın, loading'i bloklamasın
        }
      } else {
        setProfile(null);
      }
      // NOT: loading'i burada false yapmıyoruz — sadece initSession ayarlar
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    // Oturum yoksa e-posta onayı bekleniyor demektir (Supabase "Confirm email" açık)
    return { needsConfirmation: !data.session };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/dashboard' },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[AuthContext] Sign out error:', err);
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      fetchingRef.current = false; // lock'u sıfırla
      await fetchProfile(user.id);
    }
  };

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      session, user, profile, loading, isAdmin,
      signUp, signIn, signInWithGoogle, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

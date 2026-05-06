import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

const DeepLinkHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let handle: { remove: () => void } | null = null;

    CapApp.addListener('appUrlOpen', (event) => {
      try {
        // Supports both:
        // - HTTPS App Links: https://callifyleads.com/invite?...
        // - Custom scheme:   com.lovable.mobilecrmwithsimcalls://invite?...
        const url = new URL(event.url);
        const path = url.pathname || '/';
        const search = url.search || '';
        const hash = url.hash || '';
        navigate(path + search + hash, { replace: true });
      } catch {
        // ignore malformed URL
      }
    }).then((h) => { handle = h; });

    return () => { handle?.remove(); };
  }, [navigate]);

  return null;
};

export default DeepLinkHandler;

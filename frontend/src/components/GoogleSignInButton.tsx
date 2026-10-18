'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef } from 'react';

type GoogleCredentialResponse = { credential?: string };
type GoogleButtonProps = {
  onCredential: (credential: string) => void | Promise<void>;
  disabled?: boolean;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme: 'outline';
              size: 'large';
              shape: 'rectangular';
              text: 'continue_with';
              width: number;
              logo_alignment: 'left';
            }
          ) => void;
        };
      };
    };
  }
}

export default function GoogleSignInButton({ onCredential, disabled = false }: GoogleButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef(onCredential);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  const initialize = useCallback(() => {
    if (!clientId || !window.google?.accounts?.id || !containerRef.current) return;
    containerRef.current.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) void callbackRef.current(response.credential);
      },
    });
    window.google.accounts.id.renderButton(containerRef.current, {
      theme: 'outline',
      size: 'large',
      shape: 'rectangular',
      text: 'continue_with',
      width: Math.max(220, Math.floor(containerRef.current.clientWidth || 280)),
      logo_alignment: 'left',
    });
  }, [clientId]);

  useEffect(() => {
    if (window.google?.accounts?.id) initialize();
  }, [initialize]);

  if (!clientId) {
    return <p className="text-xs text-text-dim text-center">Google sign-in needs its OAuth client ID configured.</p>;
  }

  return (
    <div className={disabled ? 'pointer-events-none opacity-50' : ''} aria-disabled={disabled}>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initialize} />
      <div ref={containerRef} className="flex justify-center min-h-10" />
    </div>
  );
}
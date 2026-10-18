'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { inputClass } from '@/components/AuthCard';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export default function PasswordInput({ className = '', ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${inputClass} pr-11 ${className}`}
      />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-text-dim hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-r"
      >
        {visible ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
            <path d="M9.9 5.2A10.9 10.9 0 0 1 12 5c6.3 0 9.7 7 9.7 7a15.2 15.2 0 0 1-3.2 4.1" />
            <path d="M6.2 6.3C3.7 8.1 2.3 12 2.3 12s3.4 7 9.7 7a10.7 10.7 0 0 0 3.1-.5" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M2.3 12s3.4-7 9.7-7 9.7 7 9.7 7-3.4 7-9.7 7-9.7-7-9.7-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
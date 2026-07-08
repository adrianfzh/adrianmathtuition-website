'use client';

import { useState, type InputHTMLAttributes } from 'react';

// Controlled password input with a show/hide eye toggle. Drop-in for a plain
// <input type="password">: pass value + onChange(value) and any input attrs
// (placeholder, required, autoComplete, disabled, className, …) pass straight
// through. The eye button toggles type password↔text and never submits the
// surrounding form (type="button").

type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'type'
> & {
  value: string;
  onChange: (value: string) => void;
};

const EyeIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.16 3.19M6.6 6.6A17.6 17.6 0 0 0 2 11s3.5 7 10 7a9.12 9.12 0 0 0 3.66-.76" />
    <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

export default function PasswordInput({
  value,
  onChange,
  className,
  style,
  ...rest
}: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        {...rest}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        style={{ ...style, paddingRight: '2.75rem' }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#94a3b8',
          lineHeight: 0,
        }}
      >
        {show ? EyeOffIcon : EyeIcon}
      </button>
    </div>
  );
}

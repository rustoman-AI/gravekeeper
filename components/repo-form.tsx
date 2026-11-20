'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

export interface RepoFormProps {
  initialValue?: string;
  /** Focuses the input once on mount. Off by default so the initial landing load does not steal focus. */
  focusOnMount?: boolean;
  /** Called with the trimmed input, as typed, when it is not empty. */
  onSubmit: (value: string) => void;
}

const EMPTY_MESSAGE = 'Enter a repository URL';
const MESSAGE_ID = 'repo-url-message';

// Requirements 1.2 to 1.5: labelled input, "Dig up" button, empty-input message.
export function RepoForm({ initialValue = '', focusOnMount = false, onSubmit }: RepoFormProps) {
  const [value, setValue] = useState(initialValue);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed === '') {
      setMessage(EMPTY_MESSAGE);
      inputRef.current?.focus();
      return;
    }
    setMessage('');
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
      <label htmlFor="repo-url" className="text-bone">
        GitHub repository URL
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          id="repo-url"
          name="repo"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby={message === '' ? undefined : MESSAGE_ID}
          aria-invalid={message === '' ? undefined : true}
          placeholder="https://github.com/owner/repo"
          className="min-h-11 flex-1 rounded border border-bone-muted bg-night-raised px-3 text-bone placeholder:text-bone-muted"
        />
        <button
          type="submit"
          className="min-h-11 rounded bg-amber px-5 font-semibold text-night hover:bg-bone"
        >
          Dig up
        </button>
      </div>
      <p id={MESSAGE_ID} role="status" aria-live="polite" className="min-h-6 text-amber">
        {message}
      </p>
    </form>
  );
}

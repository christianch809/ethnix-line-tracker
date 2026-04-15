import React, { useState, useRef, useEffect } from 'react';

// Text cell — click to edit, blur/Enter to save
export function TextCell({ value, onSave, placeholder, className = '', mono = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value || ''); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== (value || '')) onSave(draft);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); } }}
        className={`w-full bg-blue-50 border border-blue-300 rounded px-1.5 py-0.5 text-sm outline-none ${mono ? 'font-mono' : ''}`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50 min-h-[28px] text-sm transition-colors ${mono ? 'font-mono' : ''} ${!value ? 'text-gray-300 italic' : ''} ${className}`}
    >
      {value || placeholder || '—'}
    </div>
  );
}

// Select cell — click to get dropdown, change auto-saves
export function SelectCell({ value, options, onSave, className = '' }) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef(null);

  useEffect(() => { if (editing && selectRef.current) selectRef.current.focus(); }, [editing]);

  if (editing) {
    return (
      <select
        ref={selectRef}
        value={value || ''}
        onChange={e => { onSave(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        className="w-full bg-blue-50 border border-blue-300 rounded px-1 py-0.5 text-sm outline-none"
      >
        <option value="">—</option>
        {options.map(o => {
          const val = typeof o === 'string' ? o : o.value;
          const label = typeof o === 'string' ? o : o.label;
          return <option key={val} value={val}>{label}</option>;
        })}
      </select>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50 min-h-[28px] text-sm transition-colors ${!value ? 'text-gray-300 italic' : ''} ${className}`}
    >
      {(typeof options[0] === 'object' ? options.find(o => o.value === value)?.label : value) || '—'}
    </div>
  );
}

// Number cell
export function NumberCell({ value, onSave, prefix = '', placeholder = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const num = draft === '' ? null : Number(draft);
    if (num !== (value ?? null)) onSave(num);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); } }}
        className="w-full bg-blue-50 border border-blue-300 rounded px-1.5 py-0.5 text-sm outline-none"
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={`cursor-pointer px-1.5 py-0.5 rounded hover:bg-blue-50 min-h-[28px] text-sm transition-colors ${!value && value !== 0 ? 'text-gray-300 italic' : ''}`}
    >
      {value != null ? `${prefix}${Number(value).toFixed(2)}` : placeholder || '—'}
    </div>
  );
}

// Status badge
export function StatusBadge({ status, verified }) {
  const colors = {
    active: verified ? 'bg-green-100 text-green-800 border-green-300' : 'bg-orange-100 text-orange-800 border-orange-300',
    inactive: 'bg-red-100 text-red-800 border-red-300',
    assigned: verified ? 'bg-green-100 text-green-800 border-green-300' : 'bg-orange-100 text-orange-800 border-orange-300',
    available: 'bg-gray-100 text-gray-600 border-gray-300',
    damaged: 'bg-red-100 text-red-800 border-red-300',
    lost: 'bg-red-100 text-red-800 border-red-300',
  };
  const c = colors[status] || 'bg-gray-100 text-gray-600 border-gray-300';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${c}`}>
      {status}
    </span>
  );
}

// Verified button — big, clear, one-click
export function VerifiedCheck({ verified, verifiedBy, verifiedAt, onToggle }) {
  if (verified) {
    return (
      <button
        onClick={onToggle}
        title={`Verified by ${verifiedBy}\n${verifiedAt ? new Date(verifiedAt).toLocaleString() : ''}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-500 text-white shadow-sm hover:bg-green-600 transition cursor-pointer whitespace-nowrap"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        Verified
      </button>
    );
  }

  return (
    <button
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-400 text-white shadow-sm hover:bg-orange-500 transition cursor-pointer whitespace-nowrap animate-pulse"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" /></svg>
      Verify
    </button>
  );
}

// Invoice status badge for Lines table
export function InvoiceStatusBadge({ status }) {
  if (status === 'billed') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-300">✅ Billed</span>;
  }
  if (status === 'not_billed') {
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-300">🟠 Not Billed</span>;
  }
  return <span className="text-gray-300 text-xs">—</span>;
}

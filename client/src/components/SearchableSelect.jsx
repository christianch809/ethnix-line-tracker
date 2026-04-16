import React, { useState, useRef, useEffect } from 'react';

export default function SearchableSelect({ options, value, onSelect, placeholder = 'Search...', onClose }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const filtered = options.filter(o => {
    const term = search.toLowerCase();
    return o.label.toLowerCase().includes(term) || (o.sub || '').toLowerCase().includes(term);
  });

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-blue-50 border border-blue-300 rounded px-2 py-1 text-xs outline-none"
        onKeyDown={e => { if (e.key === 'Escape') onClose?.(); }}
      />
      <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
        <button
          onClick={() => { onSelect(null); onClose?.(); }}
          className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 border-b"
        >
          — None / Remove —
        </button>
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400">No results</div>
        ) : (
          filtered.map(o => (
            <button
              key={o.value}
              onClick={() => { onSelect(o.value); onClose?.(); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-gray-50 ${String(o.value) === String(value) ? 'bg-blue-100 font-bold' : ''}`}
            >
              <div className="font-medium">{o.label}</div>
              {o.sub && <div className="text-gray-400">{o.sub}</div>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

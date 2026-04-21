'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: string;
  color?: string;
  hint?: string;
}

interface FilterSelectProps {
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  align?: 'start' | 'end';
}

export function FilterSelect({
  value,
  options,
  onChange,
  placeholder = 'All',
  label,
  className,
  align = 'start',
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-[12px] text-foreground transition-colors',
          'hover:bg-accent/50',
          open && 'bg-accent/50'
        )}
      >
        {label && <span className="text-muted-foreground">{label}</span>}
        {active?.color && (
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ background: active.color }}
          />
        )}
        <span className="font-medium truncate max-w-[180px]">
          {active?.label ?? placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[200px] max-h-[300px] overflow-auto rounded-md border bg-popover p-1 shadow-md scrollbar-thin',
            align === 'end' ? 'right-0' : 'left-0'
          )}
          role="listbox"
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]',
                  'hover:bg-accent',
                  selected && 'bg-accent/60'
                )}
              >
                {opt.color ? (
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ background: opt.color }}
                  />
                ) : (
                  <span className="h-2 w-2 shrink-0" />
                )}
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.hint && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">{opt.hint}</span>
                )}
                {selected && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { formatDelta } from "@/lib/menu";

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(open));
    return () => cancelAnimationFrame(r);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl md:inset-x-auto md:right-0 md:top-0 md:max-h-none md:h-full md:max-w-md md:rounded-none md:rounded-l-3xl bg-[#fdfcfc] text-[#43281a] shadow-2xl transition-transform duration-300 ease-out ${
          shown ? "translate-y-0 md:translate-x-0" : "translate-y-full md:translate-y-0 md:translate-x-full"
        }`}
      >
        <header className="flex items-start gap-2 rounded-t-3xl md:rounded-none border-b border-transparent bg-[#fdfcfc] px-4 pb-3.5 pt-4 md:px-6 md:pt-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold leading-snug text-[#43281a]">{title}</h2>
            {subtitle && <p className="text-sm font-black text-[#155727]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="-mr-1 -mt-1 flex h-10 w-10 items-center justify-center rounded-full text-2xl text-[#43281a]/70 hover:bg-[#155727]/10 active:scale-95"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {footer && (
          <footer className="border-t border-transparent bg-[#fdfcfc] p-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function Stepper({
  value,
  min = 1,
  max = 99,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-transparent bg-white p-1 shadow-2xs">
      <button
        type="button"
        aria-label="Giảm"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-base font-bold text-[#155727] hover:bg-[#155727]/10 active:bg-[#155727]/20 disabled:opacity-30"
      >
        −
      </button>
      <span className="min-w-7 text-center text-sm font-extrabold text-[#43281a]">{value}</span>
      <button
        type="button"
        aria-label="Tăng"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-base font-bold text-[#155727] hover:bg-[#155727]/10 active:bg-[#155727]/20 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

export function OptionGroup({
  title,
  required,
  children,
}: {
  title: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className="border-b border-black/5 px-4 pb-5 mt-5 pt-2">
      <legend className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-[#43281a]">
        <span>{title}</span>
        {required ? (
          <span className="rounded-full bg-[#155727]/10 px-2 py-0.5 text-[10px] font-bold text-[#155727]">Bắt buộc</span>
        ) : (
          <span className="text-[11px] font-medium text-[#43281a]/60">(Tùy chọn)</span>
        )}
      </legend>
      <div className="mt-2.5 space-y-2">{children}</div>
    </fieldset>
  );
}

export function OptionTile({
  kind,
  label,
  price,
  hint,
  disabled,
  checked,
  onSelect,
}: {
  kind: "radio" | "checkbox";
  label: string;
  price?: number;
  hint?: string;
  disabled?: boolean;
  checked: boolean;
  onSelect: () => void;
}) {
  const delta = price !== undefined ? formatDelta(price) : "";
  return (
    <label
      className={`flex min-h-[46px] cursor-pointer items-center justify-between rounded-xl border p-3 text-sm transition-all ${
        disabled
          ? "cursor-not-allowed border-dashed border-transparent bg-white/40 opacity-45"
          : checked
          ? "border-[#155727] bg-[#155727]/10 shadow-2xs"
          : "border-transparent bg-white hover:border-[#155727]/40"
      }`}
    >
      <div className="flex items-center gap-3">
        <input
          type={kind}
          disabled={disabled}
          checked={checked}
          onChange={onSelect}
          className="h-4 w-4 accent-[#155727]"
        />
        <div>
          <span className={`font-semibold ${checked ? "text-[#155727]" : "text-[#43281a]"}`}>{label}</span>
          {hint && <span className="block text-[11px] text-[#43281a]/65">{hint}</span>}
        </div>
      </div>
      {delta && <span className="text-xs font-bold text-[#155727]">{delta}</span>}
    </label>
  );
}

export function Chips<T extends number>({
  values,
  value,
  onChange,
  renderLabel = (v) => `${v}`,
}: {
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
  renderLabel?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`min-h-[38px] min-w-[50px] rounded-xl px-3.5 text-xs font-bold transition-all ${
              active
                ? "bg-[#155727] text-[#fdfcfc] shadow-xs"
                : "border border-transparent bg-white text-[#43281a] hover:border-[#155727]/40"
            }`}
          >
            {renderLabel(v)}
          </button>
        );
      })}
    </div>
  );
}

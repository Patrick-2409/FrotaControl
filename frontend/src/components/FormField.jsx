export default function FormField({ label, children }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm text-slate-300">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "fc-input";

export const primaryButtonClass =
  "fc-btn w-full bg-blue-600 px-4 py-3 text-slate-50";

export const secondaryButtonClass =
  "fc-btn w-full border border-slate-600 bg-slate-900 px-4 py-3 text-slate-100";

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
  "fc-btn btn-primary w-full px-4 py-3";

export const secondaryButtonClass =
  "fc-btn btn-secondary w-full px-4 py-3";

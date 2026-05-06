import { useEffect, useState } from "react";

const sanitizeInitials = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "EMP";
  return parts.map((p) => p[0]?.toUpperCase() || "").join("");
};

export default function CompanyLogo({ logoUrl, companyName, className = "" }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [logoUrl]);

  if (logoUrl && !hasError) {
    return (
      <img
        src={logoUrl}
        alt={`Logo da empresa ${companyName || ""}`.trim()}
        className={`h-12 w-12 rounded-xl border border-slate-600/70 object-contain bg-transparent p-1 ${className}`.trim()}
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <div
      className={`grid h-12 w-12 place-content-center rounded-xl border border-slate-700 bg-slate-900 text-xs font-bold text-slate-300 ${className}`.trim()}
      aria-label={`Sem logo cadastrada para ${companyName || "empresa"}`}
      title={companyName || "Empresa"}
    >
      {sanitizeInitials(companyName)}
    </div>
  );
}

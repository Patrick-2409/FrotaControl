import { useEffect, useState } from "react";
import { resolveBackendAssetUrl } from "../services/api";

const sizes = {
  list: "h-8 w-8 text-xs",
  header: "h-10 w-10 text-sm",
  profile: "h-20 w-20 text-2xl",
};

const initials = (name = "") =>
  String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "U";

export default function Avatar({ imageUrl, name, size = "header", className = "" }) {
  const sizeClass = sizes[size] || sizes.header;
  const [failedToLoad, setFailedToLoad] = useState(false);
  const resolvedImageUrl = resolveBackendAssetUrl(imageUrl);

  useEffect(() => {
    // Se a URL mudar (ex.: upload novo), tenta renderizar novamente.
    setFailedToLoad(false);
  }, [resolvedImageUrl]);

  if (resolvedImageUrl && !failedToLoad) {
    return (
      <img
        src={resolvedImageUrl}
        alt={`Avatar de ${name || "usuário"}`}
        className={`${sizeClass} rounded-full border border-slate-600 object-cover ${className}`.trim()}
        onError={() => setFailedToLoad(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} grid place-content-center rounded-full border border-slate-600 bg-slate-800 font-bold text-slate-100 ${className}`.trim()}
      aria-label={`Sem foto de perfil para ${name || "usuário"}`}
    >
      {initials(name)}
    </div>
  );
}

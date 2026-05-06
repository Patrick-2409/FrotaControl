const sizes = {
  hero: "h-24 w-24 sm:h-28 sm:w-28",
  auth: "h-20 w-20",
  header: "h-11 w-11",
  minimal: "h-6 w-6",
};

export default function SystemLogo({ variant = "auth", className = "", alt = "Logo FrotaControl" }) {
  const sizeClass = sizes[variant] || sizes.auth;
  return (
    <img
      src="/frotacontrol-logo.png"
      alt={alt}
      className={`${sizeClass} rounded-2xl object-contain ${className}`.trim()}
    />
  );
}

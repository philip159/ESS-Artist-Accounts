import logoImage from "@assets/east-side-studio-logo.png";

interface BrandLogoProps {
  className?: string;
  height?: number;
}

export function BrandLogo({ className = "", height = 32 }: BrandLogoProps) {
  return (
    <img
      src={logoImage}
      alt="East Side Studio"
      className={className}
      style={{ height: `${height}px`, width: "auto", objectFit: "contain" }}
    />
  );
}

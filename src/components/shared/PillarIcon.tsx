interface PillarIconProps {
  icon: string;
  iconUrl?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function PillarIcon({ icon, iconUrl, size = 48, className = "", style }: PillarIconProps) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt="pillar icon"
        className={`object-contain rounded-lg ${className}`}
        style={{ width: size, height: size, ...style }}
        loading="lazy"
      />
    );
  }

  return (
    <span className={className} style={{ fontSize: size * 0.8, lineHeight: 1, ...style }}>
      {icon}
    </span>
  );
}

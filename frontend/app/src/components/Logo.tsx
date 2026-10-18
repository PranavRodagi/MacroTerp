// MacroTerp logo: a plate of chicken and leafy greens on a sage disc (assets/logo-mark.svg,
// also the favicon) + the name.
import logoMark from "../assets/logo-mark.svg";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? "logo--compact" : ""}`}>
      <img alt="" className="logo-mark" draggable={false} src={logoMark} />
      <span className="logo-name">MacroTerp</span>
    </div>
  );
}

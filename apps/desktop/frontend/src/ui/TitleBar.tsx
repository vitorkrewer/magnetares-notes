import { useEffect, useState } from "react";
import { Maximize2, Minimize2, Minus, X } from "lucide-react";
import "./types";

type TitleBarProps = {
  title?: string;
};

export function TitleBar({ title = "Magnetares Notes" }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const bridge = window.go?.main?.App;
    if (!bridge?.IsWindowMaximized) return;

    void bridge.IsWindowMaximized().then(setIsMaximized);
  }, []);

  const handleMinimize = () => {
    void window.go?.main?.App?.MinimizeWindow?.();
  };

  const handleToggleMaximize = async () => {
    const bridge = window.go?.main?.App;
    if (!bridge?.ToggleMaximizeWindow) return;
    const nextState = await bridge.ToggleMaximizeWindow();
    setIsMaximized(nextState);
  };

  const handleClose = () => {
    void window.go?.main?.App?.CloseWindow?.();
  };

  return (
    <header className="titlebar" style={{ "--wails-draggable": "drag" } as React.CSSProperties}>
      <div
        className={`traffic-lights ${isHovered ? "hovered" : ""}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          className="traffic-light close"
          onClick={handleClose}
          title="Fechar"
          aria-label="Fechar janela"
        >
          {isHovered && <X className="traffic-icon" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="traffic-light minimize"
          onClick={handleMinimize}
          title="Minimizar"
          aria-label="Minimizar janela"
        >
          {isHovered && <Minus className="traffic-icon" aria-hidden="true" />}
        </button>
        <button
          type="button"
          className="traffic-light maximize"
          onClick={() => void handleToggleMaximize()}
          title={isMaximized ? "Restaurar" : "Maximizar"}
          aria-label={isMaximized ? "Restaurar janela" : "Maximizar janela"}
        >
          {isHovered && (
            isMaximized ? (
              <Minimize2 className="traffic-icon" aria-hidden="true" />
            ) : (
              <Maximize2 className="traffic-icon" aria-hidden="true" />
            )
          )}
        </button>
      </div>
      <div className="titlebar-title">{title}</div>
    </header>
  );
}

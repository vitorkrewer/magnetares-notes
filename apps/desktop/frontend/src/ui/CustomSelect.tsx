import { Check, ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export type CustomSelectProps = {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  className?: string;
  compact?: boolean;
};

type PopoverPosition = {
  left: number;
  top?: number;
  bottom?: number;
  minWidth: number;
  maxHeight: number;
  placement: "top" | "bottom";
};

function findNextEnabledIndex(
  options: SelectOption[],
  startIndex: number,
  direction: 1 | -1
): number {
  if (options.length === 0) return -1;
  for (let step = 0; step < options.length; step += 1) {
    const idx = (startIndex + direction * step + options.length) % options.length;
    if (!options[idx].disabled) {
      return idx;
    }
  }
  return -1;
}

/**
 * Custom accessible select dropdown rendered via portal to avoid clipping
 * inside scrollable modals, inspectors, or overflow-hidden containers.
 */
export function CustomSelect({
  id,
  value,
  options,
  onChange,
  placeholder = "Selecionar…",
  disabled = false,
  ariaLabel,
  title,
  className = "",
  compact = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value]
  );

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportMargin = 8;
    const gap = 4;
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportMargin - gap);
    const spaceAbove = Math.max(0, rect.top - viewportMargin - gap);

    const measuredHeight = popoverRef.current?.scrollHeight ?? 0;
    const estimatedHeight = measuredHeight > 0 ? measuredHeight : Math.min(280, options.length * 34 + 10);

    const placement: "top" | "bottom" =
      spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? "top" : "bottom";

    const availableSpace = placement === "bottom" ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(110, Math.min(280, availableSpace));
    const minWidth = Math.max(rect.width, compact ? 132 : rect.width);

    const popoverWidth = popoverRef.current?.offsetWidth ?? minWidth;
    const maxLeft = Math.max(viewportMargin, window.innerWidth - popoverWidth - viewportMargin);
    const left = Math.min(Math.max(viewportMargin, rect.left), maxLeft);

    if (placement === "top") {
      setPosition({
        left,
        bottom: window.innerHeight - rect.top + gap,
        minWidth,
        maxHeight,
        placement,
      });
    } else {
      setPosition({
        left,
        top: rect.bottom + gap,
        minWidth,
        maxHeight,
        placement,
      });
    }
  }, [compact, options.length]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    updatePosition();
    const rafId = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, highlightedIndex]);

  const openMenu = useCallback(() => {
    if (disabled || options.length === 0) return;
    const selectedIdx = options.findIndex((opt) => opt.value === value && !opt.disabled);
    const initialIdx = selectedIdx >= 0 ? selectedIdx : findNextEnabledIndex(options, 0, 1);
    setHighlightedIndex(initialIdx);
    setOpen(true);
  }, [disabled, options, value]);

  const selectIndex = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option || option.disabled) return;
      setOpen(false);
      if (option.value !== value) {
        onChange(option.value);
      }
    },
    [onChange, options, value]
  );

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (!open) {
          openMenu();
        } else {
          setHighlightedIndex((prev) => findNextEnabledIndex(options, prev + 1, 1));
        }
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          openMenu();
        } else {
          setHighlightedIndex((prev) => findNextEnabledIndex(options, prev - 1, -1));
        }
        break;
      }
      case "Home": {
        if (open) {
          event.preventDefault();
          setHighlightedIndex(findNextEnabledIndex(options, 0, 1));
        }
        break;
      }
      case "End": {
        if (open) {
          event.preventDefault();
          setHighlightedIndex(findNextEnabledIndex(options, options.length - 1, -1));
        }
        break;
      }
      case "Enter":
      case " ": {
        if (open) {
          event.preventDefault();
          if (highlightedIndex >= 0) {
            selectIndex(highlightedIndex);
          } else {
            setOpen(false);
          }
        }
        break;
      }
      case "Escape": {
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
        break;
      }
      case "Tab": {
        if (open) {
          setOpen(false);
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <div
      className={`custom-select ${compact ? "is-compact" : ""} ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""} ${className}`.trim()}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="custom-select-trigger"
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={`custom-select-value ${!selectedOption ? "is-placeholder" : ""}`}>
          {selectedOption?.icon && (
            <span className="custom-select-option-icon" aria-hidden="true">
              {selectedOption.icon}
            </span>
          )}
          <span className="custom-select-label">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown className="custom-select-chevron" aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel || title}
            className={`custom-select-popover ${compact ? "is-compact" : ""} ${position?.placement === "top" ? "is-top" : "is-bottom"}`}
            style={
              position
                ? {
                    left: `${position.left}px`,
                    top: position.top !== undefined ? `${position.top}px` : undefined,
                    bottom: position.bottom !== undefined ? `${position.bottom}px` : undefined,
                    minWidth: `${position.minWidth}px`,
                    maxHeight: `${position.maxHeight}px`,
                  }
                : { visibility: "hidden", left: 0, top: 0 }
            }
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;
              return (
                <button
                  key={option.value}
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  disabled={option.disabled}
                  className={`custom-select-option ${isSelected ? "is-selected" : ""} ${isHighlighted ? "is-highlighted" : ""}`}
                  onMouseEnter={() => {
                    if (!option.disabled) {
                      setHighlightedIndex(index);
                    }
                  }}
                  onClick={() => selectIndex(index)}
                >
                  <span className="custom-select-option-content">
                    {option.icon && (
                      <span className="custom-select-option-icon" aria-hidden="true">
                        {option.icon}
                      </span>
                    )}
                    <span className="custom-select-option-label">{option.label}</span>
                  </span>
                  {isSelected && <Check className="custom-select-check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

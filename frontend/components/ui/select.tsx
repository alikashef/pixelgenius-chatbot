"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface SelectProps {
  id?: string;
  value: string | number;
  /** Same shape as a native select's handler, so call sites read `e.target.value`. */
  onChange?: (event: { target: { value: string } }) => void;
  /** `<option value="…">label</option>` elements, like a native select. */
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  dir?: "rtl" | "ltr" | "auto";
  "aria-label"?: string;
}

interface Option {
  value: string;
  label: ReactNode;
}

interface Position {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  up: boolean;
}

function readOptions(children: ReactNode): Option[] {
  const options: Option[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode }>;
    if (el.type === "option") {
      const label = el.props.children;
      options.push({ value: String(el.props.value ?? label ?? ""), label });
    } else if (el.props.children) {
      options.push(...readOptions(el.props.children));
    }
  });
  return options;
}

/** Popover select with the native select's API; the option list follows the app theme. */
export default function Select({
  id,
  value,
  onChange,
  children,
  className,
  disabled,
  dir,
  "aria-label": ariaLabel,
}: SelectProps) {
  const options = useMemo(() => readOptions(children), [children]);
  const current = String(value);
  const selectedIndex = options.findIndex((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const place = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const up = below < 180 && above > below;
    const maxHeight = Math.min(280, Math.max(120, up ? above : below));
    setPosition({
      top: up ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      maxHeight,
      up,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const target = e.target as Node;
      if (trigger.current?.contains(target) || list.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active, position]);

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    setOpen(false);
    trigger.current?.focus();
    if (option && option.value !== current) onChange?.({ target: { value: option.value } });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        dir={dir}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={cn("flex items-center justify-between gap-2 text-start", className)}
      >
        <span className={cn("min-w-0 flex-1 truncate", !selected?.value && "text-muted-foreground/80")}>
          {selected?.label ?? ""}
        </span>
        <IconChevronDown
          size={16}
          aria-hidden="true"
          className={cn("shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")}
        />
      </button>
      {open &&
        position &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            dir={dir}
            style={{
              position: "fixed",
              left: position.left,
              width: Math.max(position.width, 64),
              maxHeight: position.maxHeight,
              ...(position.up ? { bottom: window.innerHeight - position.top } : { top: position.top }),
            }}
            className="z-[100] overflow-y-auto rounded-xl border border-border bg-surface p-1 text-sm shadow-elevated"
          >
            {options.map((option, index) => {
              const isSelected = index === selectedIndex;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => choose(index)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors",
                    index === active ? "bg-surface-2 text-foreground" : "text-secondary-foreground",
                    isSelected && "font-bold text-foreground",
                  )}
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {isSelected && <IconCheck size={15} aria-hidden="true" className="shrink-0 text-brand" />}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}

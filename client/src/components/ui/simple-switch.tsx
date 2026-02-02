import * as React from "react"
import { cn } from "@/lib/utils"

export interface SimpleSwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  value?: string;
  required?: boolean;
  "data-testid"?: string;
}

const SimpleSwitch = React.forwardRef<HTMLButtonElement, SimpleSwitchProps>(
  ({ 
    checked, 
    defaultChecked = false,
    onCheckedChange, 
    disabled = false, 
    className,
    id,
    name,
    value,
    required,
    "data-testid": dataTestId,
    ...props 
  }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
    
    const isControlled = checked !== undefined;
    const isChecked = isControlled ? checked : internalChecked;

    const handleClick = React.useCallback(() => {
      if (disabled) return;
      
      const newValue = !isChecked;
      
      if (!isControlled) {
        setInternalChecked(newValue);
      }
      
      onCheckedChange?.(newValue);
    }, [disabled, isChecked, isControlled, onCheckedChange]);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    }, [handleClick]);

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={isChecked}
        aria-disabled={disabled}
        disabled={disabled}
        id={id}
        data-state={isChecked ? "checked" : "unchecked"}
        data-disabled={disabled ? "" : undefined}
        data-testid={dataTestId}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isChecked ? "bg-sage" : "bg-input",
          className
        )}
        {...props}
      >
        <span
          data-state={isChecked ? "checked" : "unchecked"}
          className={cn(
            "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
            isChecked ? "translate-x-5" : "translate-x-0"
          )}
        />
        {name && (
          <input
            type="hidden"
            name={name}
            value={isChecked ? (value || "on") : ""}
            required={required}
          />
        )}
      </button>
    )
  }
)

SimpleSwitch.displayName = "SimpleSwitch"

export { SimpleSwitch }

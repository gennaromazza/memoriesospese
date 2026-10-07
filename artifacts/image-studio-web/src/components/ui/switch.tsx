import * as React from "react"
import { cn } from "@/lib/utils"

interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  value?: string;
  required?: boolean;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ 
    className, 
    checked, 
    defaultChecked = false, 
    onCheckedChange, 
    disabled, 
    name,
    value = "on",
    required,
    ...props 
  }, ref) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
    const isControlled = checked !== undefined;
    const isChecked = isControlled ? checked : internalChecked;
    
    const buttonRef = React.useRef<HTMLButtonElement>(null);
    
    React.useImperativeHandle(ref, () => buttonRef.current as HTMLButtonElement);
    
    const toggle = React.useCallback(() => {
      if (disabled) return;
      
      const newValue = !isChecked;
      if (!isControlled) {
        setInternalChecked(newValue);
      }
      onCheckedChange?.(newValue);
    }, [disabled, isChecked, isControlled, onCheckedChange]);

    const handleClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      toggle();
      props.onClick?.(e);
    }, [toggle, props.onClick]);

    const handleKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        toggle();
      }
      if (e.key === ' ') {
        e.preventDefault();
      }
      props.onKeyDown?.(e);
    }, [toggle, props.onKeyDown]);

    const handleKeyUp = React.useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ') {
        e.preventDefault();
        toggle();
      }
      props.onKeyUp?.(e);
    }, [toggle, props.onKeyUp]);

    return (
      <>
        <button
          type="button"
          role="switch"
          aria-checked={isChecked}
          aria-required={required}
          aria-disabled={disabled}
          data-state={isChecked ? "checked" : "unchecked"}
          data-disabled={disabled ? "" : undefined}
          disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          ref={buttonRef}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          className={cn(
            "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-sage data-[state=unchecked]:bg-input",
            className
          )}
          {...props}
        >
          <span
            data-state={isChecked ? "checked" : "unchecked"}
            className={cn(
              "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
            )}
          />
        </button>
        {name && (
          <input
            type="hidden"
            name={name}
            value={isChecked ? value : ""}
            disabled={disabled}
            required={required}
          />
        )}
      </>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };

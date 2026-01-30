import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  "data-testid"?: string;
}

export function QuantityInput({
  value,
  onChange,
  min = 1,
  max = 999,
  step = 1,
  className,
  size = "md",
  disabled = false,
  "data-testid": testId,
}: QuantityInputProps) {
  const handleIncrement = () => {
    const newValue = Math.min(value + step, max);
    onChange(newValue);
  };

  const handleDecrement = () => {
    const newValue = Math.max(value - step, min);
    onChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    
    if (inputValue === "") {
      onChange(min);
      return;
    }
    
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(parsed, max));
      onChange(clamped);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const sizeClasses = {
    sm: {
      container: "h-8",
      button: "h-8 w-8 min-w-[32px]",
      input: "h-8 w-12 text-sm",
      icon: "h-3 w-3",
    },
    md: {
      container: "h-10",
      button: "h-10 w-10 min-w-[40px]",
      input: "h-10 w-14 text-base",
      icon: "h-4 w-4",
    },
    lg: {
      container: "h-12",
      button: "h-12 w-12 min-w-[48px]",
      input: "h-12 w-16 text-lg",
      icon: "h-5 w-5",
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border border-input bg-background",
        sizes.container,
        disabled && "opacity-50",
        className
      )}
      data-testid={testId}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          sizes.button,
          "rounded-l-lg rounded-r-none border-r border-input hover:bg-muted",
          "touch-manipulation active:scale-95 transition-transform"
        )}
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        aria-label="Diminuisci quantità"
      >
        <Minus className={sizes.icon} />
      </Button>

      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        disabled={disabled}
        className={cn(
          sizes.input,
          "border-0 rounded-none text-center font-medium",
          "focus-visible:ring-0 focus-visible:ring-offset-0",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        )}
        aria-label="Quantità"
      />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          sizes.button,
          "rounded-r-lg rounded-l-none border-l border-input hover:bg-muted",
          "touch-manipulation active:scale-95 transition-transform"
        )}
        onClick={handleIncrement}
        disabled={disabled || value >= max}
        aria-label="Aumenta quantità"
      >
        <Plus className={sizes.icon} />
      </Button>
    </div>
  );
}

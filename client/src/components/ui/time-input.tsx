import * as React from "react";
import { Clock, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { Button } from "./button";
import { cn } from "../../lib/utils";

interface TimeInputProps {
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  "data-testid"?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

const TimeInput = React.forwardRef<HTMLDivElement, TimeInputProps>(
  ({ value = "", onChange, onBlur, disabled, className, id, name, placeholder, "data-testid": dataTestId }, ref) => {
    const [hours, minutes] = React.useMemo(() => {
      if (!value || !value.includes(":")) return ["", ""];
      const parts = value.split(":");
      return [parts[0] || "", parts[1] || ""];
    }, [value]);

    const handleHoursChange = (newHours: string) => {
      const newValue = `${newHours}:${minutes || "00"}`;
      onChange?.({ target: { value: newValue } });
    };

    const handleMinutesChange = (newMinutes: string) => {
      const newValue = `${hours || "00"}:${newMinutes}`;
      onChange?.({ target: { value: newValue } });
    };

    const handleClear = () => {
      onChange?.({ target: { value: "" } });
    };

    const hasValue = hours !== "" || minutes !== "";

    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
        id={id}
        data-testid={dataTestId}
      >
        <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <Select
          value={hours}
          onValueChange={handleHoursChange}
          disabled={disabled}
        >
          <SelectTrigger
            className="h-8 w-[60px] border-0 bg-transparent px-2 shadow-none focus:ring-0"
            onBlur={onBlur}
          >
            <SelectValue placeholder="--" />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {HOURS.map((h) => (
              <SelectItem key={h} value={h}>
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground font-medium">:</span>
        <Select
          value={minutes}
          onValueChange={handleMinutesChange}
          disabled={disabled}
        >
          <SelectTrigger
            className="h-8 w-[60px] border-0 bg-transparent px-2 shadow-none focus:ring-0"
            onBlur={onBlur}
          >
            <SelectValue placeholder="--" />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {MINUTES.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasValue && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleClear}
            tabIndex={-1}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        {name && <input type="hidden" name={name} value={value} />}
      </div>
    );
  }
);

TimeInput.displayName = "TimeInput";

export { TimeInput };

import * as React from "react";
import { Clock, X } from "lucide-react";
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

    const handleHoursChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newHours = e.target.value;
      const newValue = newHours ? `${newHours}:${minutes || "00"}` : "";
      onChange?.({ target: { value: newValue } });
    };

    const handleMinutesChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newMinutes = e.target.value;
      const newValue = newMinutes ? `${hours || "00"}:${newMinutes}` : "";
      onChange?.({ target: { value: newValue } });
    };

    const handleClear = () => {
      onChange?.({ target: { value: "" } });
    };

    const hasValue = hours !== "" || minutes !== "";

    const selectClass = cn(
      "h-8 border-0 bg-transparent px-1 text-sm focus:outline-none focus:ring-0 cursor-pointer appearance-none",
      "text-center",
      disabled && "cursor-not-allowed opacity-50"
    );

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

        <select
          value={hours}
          onChange={handleHoursChange}
          onBlur={onBlur}
          disabled={disabled}
          className={selectClass}
          style={{ width: "52px" }}
          aria-label="Ore"
        >
          <option value="">--</option>
          {HOURS.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>

        <span className="text-muted-foreground font-medium select-none">:</span>

        <select
          value={minutes}
          onChange={handleMinutesChange}
          onBlur={onBlur}
          disabled={disabled}
          className={selectClass}
          style={{ width: "52px" }}
          aria-label="Minuti"
        >
          <option value="">--</option>
          {MINUTES.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

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

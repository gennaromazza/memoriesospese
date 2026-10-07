import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale/it";
import type { DateRange } from "react-day-picker";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

export type CashDashboardDateRange =
  | "all"
  | "day"
  | "custom"
  | "month"
  | "quarter"
  | "year";

type Props = {
  dateRange: CashDashboardDateRange;
  onDateRangeChange: (range: CashDashboardDateRange) => void;
  customDateFrom: Date;
  customDateTo: Date;
  onCustomDatesChange: (from: Date, to: Date) => void;
};

const periodOptions: { value: CashDashboardDateRange; label: string }[] = [
  { value: "day", label: "Giorno" },
  { value: "custom", label: "Periodo" },
  { value: "month", label: "Mese" },
  { value: "quarter", label: "Trim." },
  { value: "year", label: "Anno" },
  { value: "all", label: "Tutto" },
];

export default function CashDashboardPeriodSelector({
  dateRange,
  onDateRangeChange,
  customDateFrom,
  customDateTo,
  onCustomDatesChange,
}: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [customRangeDraft, setCustomRangeDraft] = useState<DateRange>();

  const choosePeriod = (value: CashDashboardDateRange) => {
    onDateRangeChange(value);
    if (value === "custom") {
      // A fresh range must start empty; the committed dates are not a draft.
      setCustomRangeDraft(undefined);
      setCalendarOpen(true);
    } else if (value === "day") {
      setCalendarOpen(true);
    } else {
      setCalendarOpen(false);
    }
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="cash-dashboard-period-selector"
    >
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1">
        {periodOptions.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={dateRange === option.value ? "default" : "ghost"}
            size="sm"
            onClick={() => choosePeriod(option.value)}
            className="h-7 px-2 py-1 text-xs"
            data-testid={`cash-period-option-${option.value}`}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {(dateRange === "day" || dateRange === "custom") && (
        <Popover
          open={calendarOpen}
          onOpenChange={(open) => {
            if (open && dateRange === "custom" && customRangeDraft?.to) {
              setCustomRangeDraft(undefined);
            }
            setCalendarOpen(open);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              data-testid="cash-period-date-trigger"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateRange === "day" ? (
                format(customDateFrom, "d MMM yyyy", { locale: it })
              ) : (
                <>
                  {format(customDateFrom, "d MMM", { locale: it })} -{" "}
                  {format(customDateTo, "d MMM yyyy", { locale: it })}
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[calc(100vw-2rem)] max-w-[22rem] p-0"
            align="start"
          >
            {dateRange === "day" ? (
              <Calendar
                mode="single"
                selected={customDateFrom}
                defaultMonth={customDateFrom}
                onSelect={(date) => {
                  if (!date) return;
                  onCustomDatesChange(date, date);
                  setCalendarOpen(false);
                }}
                locale={it}
                initialFocus
              />
            ) : (
              <div className="p-3">
                <p className="mb-2 text-center text-xs font-medium text-muted-foreground">
                  Seleziona data iniziale e finale
                </p>
                <Calendar
                  mode="range"
                  min={1}
                  selected={customRangeDraft}
                  defaultMonth={customDateFrom}
                  onSelect={(range) => {
                    if (!range?.from) return;
                    setCustomRangeDraft(range);
                    if (!range.to) return;

                    onCustomDatesChange(range.from, range.to);
                    setCalendarOpen(false);
                  }}
                  locale={it}
                  numberOfMonths={1}
                  initialFocus
                />
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
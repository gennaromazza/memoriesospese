import { useEffect, useRef, useState } from "react";
import { format, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarRange } from "lucide-react";
import { getDefaultClassNames } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ConsultationDateRange = {
  from: Date | undefined;
  to: Date | undefined;
};

type ConsultationDateRangeFilterProps = {
  value: ConsultationDateRange;
  onRangeChange: (range: ConsultationDateRange) => void;
  busyDaySet?: ReadonlySet<string>;
};

const EMPTY_BUSY_DAYS: ReadonlySet<string> = new Set();
const defaultDayPickerClassNames = getDefaultClassNames();
const consultationCalendarClassNames = {
  months: cn(
    defaultDayPickerClassNames.months,
    "flex w-full flex-col gap-4 sm:flex-row sm:gap-3",
  ),
  month: cn(
    defaultDayPickerClassNames.month,
    "w-full min-w-0 space-y-4 sm:w-0 sm:flex-1",
  ),
};

function getMonthsForViewport() {
  return window.matchMedia("(min-width: 640px)").matches ? 2 : 1;
}

export default function ConsultationDateRangeFilter({
  value,
  onRangeChange,
  busyDaySet = EMPTY_BUSY_DAYS,
}: ConsultationDateRangeFilterProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [numberOfMonths, setNumberOfMonths] = useState(getMonthsForViewport);
  const popoverContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const updateMonthCount = () => setNumberOfMonths(mediaQuery.matches ? 2 : 1);
    updateMonthCount();
    mediaQuery.addEventListener("change", updateMonthCount);

    return () => mediaQuery.removeEventListener("change", updateMonthCount);
  }, []);

  const handleSelect = (range: ConsultationDateRange | undefined) => {
    onRangeChange({ from: range?.from, to: range?.to });
    // DayPicker represents the first click as a one-day range; keep it open so
    // the user can still choose a distinct end date.
    if (
      range?.from &&
      range?.to &&
      range.from.getTime() !== range.to.getTime()
    ) {
      setPopoverOpen(false);
    }
  };

  const clearRange = () => {
    onRangeChange({ from: undefined, to: undefined });
  };

  return (
    <div className="space-y-2" data-testid="consultation-date-range-filter">
      <Label className="text-sm font-medium">
        Limita date disponibili (opzionale)
      </Label>
      <p className="text-xs text-muted-foreground">
        Il cliente potrà prenotare solo nelle date selezionate
      </p>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !value.from && "text-muted-foreground",
            )}
            data-testid="consultation-date-range-trigger"
            data-range-from={value.from ? format(value.from, "yyyy-MM-dd") : undefined}
            data-range-to={value.to ? format(value.to, "yyyy-MM-dd") : undefined}
          >
            <CalendarRange className="mr-2 h-4 w-4" />
            {value.from ? (
              value.to ? (
                <>
                  {format(value.from, "dd MMM", { locale: it })} -{" "}
                  {format(value.to, "dd MMM yyyy", { locale: it })}
                </>
              ) : (
                format(value.from, "dd MMMM yyyy", { locale: it })
              )
            ) : (
              "Tutte le date disponibili"
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={popoverContentRef}
          align="center"
          side="bottom"
          sideOffset={4}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              popoverContentRef.current
                ?.querySelector<HTMLButtonElement>(".rdp-day_button[tabindex='0']")
                ?.focus();
            });
          }}
          data-testid="consultation-date-range-popover"
          className="z-[110] w-[min(38rem,calc(100vw-3rem))] max-w-[calc(100vw-3rem)] max-h-[min(38rem,calc(100dvh-2rem))] overflow-y-auto overscroll-contain p-0"
        >
          <Calendar
            mode="range"
            selected={value}
            onSelect={handleSelect}
            defaultMonth={value.from ?? new Date()}
            numberOfMonths={numberOfMonths}
            locale={it}
            disabled={(date) => date < startOfDay(new Date())}
            modifiers={{
              busy: (date) => busyDaySet.has(format(date, "yyyy-MM-dd")),
            }}
            modifiersClassNames={{
              busy: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1.5 after:w-1.5 after:rounded-full after:bg-amber-500",
            }}
            className="w-full"
            classNames={consultationCalendarClassNames}
          />
          {value.from && (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={clearRange}
              >
                Rimuovi filtro date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

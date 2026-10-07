import * as React from "react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "../../lib/utils"
import { buttonVariants } from "../../components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

const defaultClassNames = getDefaultClassNames()

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const hasDropdownCaption = typeof props.captionLayout === "string" &&
    props.captionLayout.startsWith("dropdown")

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("relative p-3", className)}
      classNames={{
        months: cn(defaultClassNames.months, "flex flex-col gap-4 sm:flex-row"),
        month: cn(defaultClassNames.month, "w-full space-y-4"),
        month_caption: cn(defaultClassNames.month_caption, "flex h-9 items-center justify-center"),
        caption_label: cn(
          defaultClassNames.caption_label,
          "text-sm font-medium",
          hasDropdownCaption && "sr-only",
        ),
        dropdowns: cn(defaultClassNames.dropdowns, "flex items-center justify-center gap-2"),
        dropdown_root: cn(defaultClassNames.dropdown_root, "relative"),
        dropdown: cn(defaultClassNames.dropdown, "rounded-md border border-input bg-background px-2 py-1 text-sm"),
        nav: cn(defaultClassNames.nav, "absolute inset-x-1 top-1 flex items-center justify-between"),
        button_previous: cn(
          defaultClassNames.button_previous,
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100"
        ),
        button_next: cn(
          defaultClassNames.button_next,
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100"
        ),
        chevron: cn(defaultClassNames.chevron, "h-4 w-4"),
        month_grid: cn(defaultClassNames.month_grid, "w-full table-fixed border-collapse"),
        weekday: cn(defaultClassNames.weekday, "text-muted-foreground h-9 text-center text-[0.8rem] font-normal"),
        week: cn(defaultClassNames.week, "w-full"),
        day: cn(defaultClassNames.day, "h-9 p-0 text-center text-sm align-middle focus-within:relative focus-within:z-20"),
        day_button: cn(
          defaultClassNames.day_button,
          buttonVariants({ variant: "ghost" }),
          "h-9 w-full p-0 font-normal"
        ),
        selected: cn(defaultClassNames.selected, "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary [&>button:hover]:text-primary-foreground"),
        today: cn(defaultClassNames.today, "[&>button]:bg-accent [&>button]:text-accent-foreground"),
        outside: cn(defaultClassNames.outside, "text-muted-foreground opacity-50"),
        disabled: cn(defaultClassNames.disabled, "text-muted-foreground opacity-50"),
        range_start: cn(defaultClassNames.range_start, "[&>button]:rounded-l-md"),
        range_end: cn(defaultClassNames.range_end, "[&>button]:rounded-r-md"),
        range_middle: cn(defaultClassNames.range_middle, "[&>button]:bg-accent [&>button]:text-accent-foreground"),
        hidden: cn(defaultClassNames.hidden, "invisible"),
        ...classNames,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
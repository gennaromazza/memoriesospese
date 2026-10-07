import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Calendar } from "./calendar";

describe("Calendar", () => {
  it("renders a seven-column month grid with selectable days", () => {
    const markup = renderToStaticMarkup(
      <Calendar
        month={new Date(2026, 8, 1)}
        mode="single"
        selected={new Date(2026, 8, 25)}
      />,
    );

    expect(markup).toContain("rdp-month_grid");
    expect(markup).toContain("table-fixed");
    expect(markup).toContain("rdp-day_button");
    expect(markup).toContain("rdp-selected");
    expect(markup).toContain('aria-selected="true"');
    expect(markup.match(/<th\b/g)).toHaveLength(7);

    const weeks = [...markup.matchAll(/<tr\b[^>]*>(.*?)<\/tr>/gs)].slice(1);
    expect(weeks.length).toBeGreaterThan(3);
    for (const week of weeks) {
      expect(week[1].match(/<td\b/g)).toHaveLength(7);
    }
  });
});
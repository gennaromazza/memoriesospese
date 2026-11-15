import { describe, expect, it } from "vitest";
import { toggleMarketingAudienceFilter } from "./marketing-audience-selection";

describe("marketing audience selection", () => {
  it("replaces all clients with a selected booking campaign", () => {
    expect(toggleMarketingAudienceFilter(["all"], "campagna_natale")).toEqual(["campagna_natale"]);
  });
  it("unites only the selected Christmas and Carnival campaigns", () => {
    expect(toggleMarketingAudienceFilter(["campagna_natale"], "campagna_carnevale"))
      .toEqual(["campagna_natale", "campagna_carnevale"]);
  });
  it("makes all clients explicit and exclusive", () => {
    expect(toggleMarketingAudienceFilter(["campagna_natale", "tipo_matrimonio"], "all"))
      .toEqual(["all"]);
  });
  it("allows the last group to be deselected without falling back to all clients", () => {
    expect(toggleMarketingAudienceFilter(["campagna_natale"], "campagna_natale")).toEqual([]);
  });
});

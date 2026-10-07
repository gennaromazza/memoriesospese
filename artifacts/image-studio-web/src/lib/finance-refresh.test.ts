import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { attachFinanceRefresh } from "./finance-refresh";

describe("financial refresh policy", () => {
  it("invalidates the financial snapshot after a successful payment mutation", async () => {
    const client = new QueryClient();
    const stop = attachFinanceRefresh(client);
    client.setQueryData(["finance-dashboard"], { income: 100 });
    const mutation = client.getMutationCache().build(client, { mutationFn: async () => ({ received: 50 }) });
    await mutation.execute(undefined);
    await Promise.resolve();
    expect(client.getQueryState(["finance-dashboard"])?.isInvalidated).toBe(true);
    stop();
    client.clear();
  });
  it("handles manual query invalidations and coalesces simultaneous updates", async () => {
    const client = new QueryClient();
    const stop = attachFinanceRefresh(client);
    client.setQueryData(["finance-dashboard"], {});
    client.setQueryData(["paymentSchedules", "job"], {});
    client.setQueryData(["jobs", "job"], {});
    let updates = 0;
    const stopCount = client.getQueryCache().subscribe(event => {
      if (event.type === "updated" && event.query.queryKey[0] === "finance-dashboard" &&
          event.action.type === "invalidate") updates++;
    });
    void client.invalidateQueries({ queryKey: ["paymentSchedules"] });
    void client.invalidateQueries({ queryKey: ["jobs"] });
    await Promise.resolve();
    expect(updates).toBe(1);
    stopCount(); stop(); client.clear();
  });
});
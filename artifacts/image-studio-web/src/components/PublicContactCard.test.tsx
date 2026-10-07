import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PublicContactCard from "./PublicContactCard";
import PublicStudioStructuredData, {
  buildPublicStudioSchema,
} from "./PublicStudioStructuredData";

describe("PublicContactCard", () => {
  it("omits the contact card when all public fields are missing or blank", () => {
    const markup = renderToStaticMarkup(
      <PublicContactCard address="  " phone="" email={null} />,
    );

    expect(markup).toBe("");
  });

  it("renders only configured contact details with working links", () => {
    const markup = renderToStaticMarkup(
      <PublicContactCard phone=" +39 333 123 4567 " email="studio@example.it" />,
    );

    expect(markup).toContain("Informazioni di Contatto");
    expect(markup).toContain('href="tel:+39 333 123 4567"');
    expect(markup).toContain('href="mailto:studio@example.it"');
    expect(markup).not.toContain("Indirizzo");
    expect(markup).not.toContain("href=\"https://www.google.com/maps");
  });
});

describe("homepage studio structured data", () => {
  const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const schemas = [...indexHtml.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  )].map(([, json]) => JSON.parse(json));

  it("renders only configured contacts and the currently published hours", () => {
    const schema = buildPublicStudioSchema({
      name: "Image Studio",
      address: " Via Quinto Orazio flacco 5 - Aversa ",
      phone: " 3274656179 ",
      email: " image.studio.fotografico@gmail.com ",
      openingTime: "07:30",
      closingTime: "18:15",
    });
    if (!schema) throw new Error("Expected public studio schema");

    const markup = renderToStaticMarkup(
      <PublicStudioStructuredData
        name="Image Studio"
        address=" Via Quinto Orazio flacco 5 - Aversa "
        phone=" 3274656179 "
        email=" image.studio.fotografico@gmail.com "
        openingTime="07:30"
        closingTime="18:15"
      />,
    );
    const renderedSchema = JSON.parse(
      markup.match(/>([\s\S]*)<\/script>/)?.[1] || "null",
    );

    expect(schema).toMatchObject({
      "@id": "https://imagestudiofotografico.com/#business",
      name: "Image Studio",
      address: {
        streetAddress: "Via Quinto Orazio flacco 5 - Aversa",
      },
      telephone: "3274656179",
      email: "image.studio.fotografico@gmail.com",
      openingHoursSpecification: {
        opens: "07:30",
        closes: "18:15",
      },
    });
    expect(renderedSchema).toEqual(schema);
    expect(Object.values(schema).some((value) => value === "")).toBe(false);
  });

  it("omits unavailable contacts from JSON-LD instead of emitting empty fields", () => {
    const schema = buildPublicStudioSchema({
      name: "Image Studio",
      address: " ",
      phone: "",
      email: null,
    });
    if (!schema) throw new Error("Expected public studio schema");

    expect(schema).not.toHaveProperty("address");
    expect(schema).not.toHaveProperty("telephone");
    expect(schema).not.toHaveProperty("email");
    expect(schema).not.toHaveProperty("openingHoursSpecification");
  });

  it("omits public hours when only one valid time is available", () => {
    const schema = buildPublicStudioSchema({
      name: "Image Studio",
      openingTime: "09:00",
    });
    if (!schema) throw new Error("Expected public studio schema");

    expect(schema).not.toHaveProperty("openingHoursSpecification");
  });

  it("keeps services linked to one business and removes obsolete static contacts", () => {
    const service = schemas.find(
      (schema) =>
        schema["@id"] === "https://imagestudiofotografico.com/#service",
    );
    const serviceMarkup = [...indexHtml.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )].find(([, json]) =>
      json.includes('"https://imagestudiofotografico.com/#service"'),
    )?.[1];

    expect(service["@type"]).toBe("Service");
    expect(service.provider["@id"]).toBe(
      "https://imagestudiofotografico.com/#business",
    );
    expect(serviceMarkup?.match(/"provider"\s*:/g) ?? []).toHaveLength(1);
    expect(schemas.some((schema) => schema["@type"]?.includes?.("LocalBusiness"))).toBe(false);
    expect(indexHtml).not.toContain("info@memoriesospese.it");
    expect(indexHtml).not.toContain("+39 334 710 3142");
  });
});
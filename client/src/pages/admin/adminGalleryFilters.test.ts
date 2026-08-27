import { describe, expect, it } from "vitest";

import {
  filterAdminGalleries,
  type AdminGalleryFilters,
} from "./adminGalleryFilters";

type GalleryFixture = Parameters<typeof filterAdminGalleries>[0][number];

const defaultFilters: AdminGalleryFilters = {
  searchQuery: "",
  galleryTypeFilter: "all",
  selectionFilter: "all",
  galleryJobTypeFilter: "all",
};

function makeGallery(
  overrides: Partial<GalleryFixture> = {},
): GalleryFixture {
  return {
    id: "gallery-default",
    name: "Galleria predefinita",
    code: "DEFAULT-001",
    date: "2026-01-01",
    location: "Napoli",
    photoCount: 10,
    active: true,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function filteredIds(
  galleries: readonly GalleryFixture[],
  filters: Partial<AdminGalleryFilters> = {},
): string[] {
  return filterAdminGalleries(galleries, {
    ...defaultFilters,
    ...filters,
  }).map((gallery) => gallery.id);
}

const galleries: GalleryFixture[] = [
  makeGallery({
    id: "generic-completed-wedding",
    name: "Matrimonio Anna e Luca",
    code: "ANNA-LUCA-26",
    date: "2026-06-14",
    jobType: "matrimonio",
    selectionStatus: "completed",
  }),
  makeGallery({
    id: "generic-pending-no-job",
    name: "Servizio famiglia Rossi",
    code: "ROSSI-FAMILY",
    date: "2026-03-09",
    selectionStatus: "pending",
  }),
  makeGallery({
    id: "special-completed-wedding",
    name: "Speciale inverno Bianchi",
    code: "WINTER-BIANCHI",
    date: "2026-12-20",
    specialTheme: "natale",
    jobType: "matrimonio",
    selectionStatus: "completed",
  }),
  makeGallery({
    id: "special-pending-baptism",
    name: "Speciale battesimo Verdi",
    code: "BATTESIMO-VERDI",
    date: "2026-05-17",
    specialTheme: "primavera",
    jobType: "battesimo",
    selectionStatus: "pending",
  }),
  makeGallery({
    id: "empty-document",
    name: "",
    code: "",
  }),
];

describe("filterAdminGalleries", () => {
  describe("ricerca", () => {
    it.each([
      ["ANNA E LUCA", ["generic-completed-wedding"]],
      ["winter-bianchi", ["special-completed-wedding"]],
      ["2026-05-17", ["special-pending-baptism"]],
    ])(
      "cerca %s in nome, codice o data senza distinguere maiuscole e minuscole",
      (searchQuery, expectedIds) => {
        expect(filteredIds(galleries, { searchQuery })).toEqual(expectedIds);
      },
    );
  });

  describe("tipo galleria", () => {
    it("con all include gallerie generiche e speciali valide", () => {
      expect(filteredIds(galleries, { galleryTypeFilter: "all" })).toEqual([
        "generic-completed-wedding",
        "generic-pending-no-job",
        "special-completed-wedding",
        "special-pending-baptism",
      ]);
    });

    it("con generic esclude le gallerie con un tema speciale", () => {
      expect(filteredIds(galleries, { galleryTypeFilter: "generic" })).toEqual([
        "generic-completed-wedding",
        "generic-pending-no-job",
      ]);
    });

    it("con special include solo le gallerie con un tema speciale", () => {
      expect(filteredIds(galleries, { galleryTypeFilter: "special" })).toEqual([
        "special-completed-wedding",
        "special-pending-baptism",
      ]);
    });
  });

  describe("stato selezione", () => {
    it("con all non limita lo stato della selezione", () => {
      expect(filteredIds(galleries, { selectionFilter: "all" })).toEqual([
        "generic-completed-wedding",
        "generic-pending-no-job",
        "special-completed-wedding",
        "special-pending-baptism",
      ]);
    });

    it("con approved include solo le selezioni completate", () => {
      expect(filteredIds(galleries, { selectionFilter: "approved" })).toEqual([
        "generic-completed-wedding",
        "special-completed-wedding",
      ]);
    });
  });

  describe("categoria lavoro", () => {
    it("con all non limita la categoria", () => {
      expect(filteredIds(galleries, { galleryJobTypeFilter: "all" })).toEqual([
        "generic-completed-wedding",
        "generic-pending-no-job",
        "special-completed-wedding",
        "special-pending-baptism",
      ]);
    });

    it("con none include solo le gallerie prive di categoria", () => {
      expect(filteredIds(galleries, { galleryJobTypeFilter: "none" })).toEqual([
        "generic-pending-no-job",
      ]);
    });

    it("con una categoria specifica richiede una corrispondenza esatta", () => {
      expect(
        filteredIds(galleries, { galleryJobTypeFilter: "matrimonio" }),
      ).toEqual([
        "generic-completed-wedding",
        "special-completed-wedding",
      ]);
    });
  });

  it("applica insieme ricerca, tipo, selezione e categoria lavoro", () => {
    expect(
      filteredIds(galleries, {
        searchQuery: "bianchi",
        galleryTypeFilter: "special",
        selectionFilter: "approved",
        galleryJobTypeFilter: "matrimonio",
      }),
    ).toEqual(["special-completed-wedding"]);
  });
});

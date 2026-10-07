import { describe, expect, it } from "vitest";
import {
  getMissingSelectionReviewPhotoIds,
  shouldShowSelectedPhotoReview,
} from "./selected-photo-review";

describe("selected photo review", () => {
  it("is available only for a non-empty completed selection", () => {
    expect(shouldShowSelectedPhotoReview(true, "completed", ["photo-1"])).toBe(true);
    expect(shouldShowSelectedPhotoReview(true, "completed", [])).toBe(false);
    expect(shouldShowSelectedPhotoReview(true, "pending", ["photo-1"])).toBe(false);
    expect(shouldShowSelectedPhotoReview(false, "completed", ["photo-1"])).toBe(false);
  });

  it("finds saved photos not yet loaded after a reload", () => {
    expect(
      getMissingSelectionReviewPhotoIds({
        selectionEnabled: true,
        selectionStatus: "completed",
        selectedPhotoIds: ["loaded-photo", "next-page-photo"],
        loadedPhotoIds: ["loaded-photo"],
      }),
    ).toEqual(["next-page-photo"]);
  });

  it("includes saved product assignments and de-duplicates photo IDs", () => {
    expect(
      getMissingSelectionReviewPhotoIds({
        selectionEnabled: true,
        selectionStatus: "completed",
        selectedPhotoIds: ["assigned-photo"],
        photoAssignments: {
          "assigned-photo": ["0"],
          "another-assigned-photo": ["1"],
          "empty-assignment": [],
        },
        loadedPhotoIds: [],
      }),
    ).toEqual(["assigned-photo", "another-assigned-photo"]);
  });

  it("does not fetch more photos for an empty or unfinished selection", () => {
    expect(
      getMissingSelectionReviewPhotoIds({
        selectionEnabled: true,
        selectionStatus: "completed",
        selectedPhotoIds: [],
        loadedPhotoIds: [],
      }),
    ).toEqual([]);
    expect(
      getMissingSelectionReviewPhotoIds({
        selectionEnabled: true,
        selectionStatus: "pending",
        selectedPhotoIds: ["in-progress-photo"],
        loadedPhotoIds: [],
      }),
    ).toEqual([]);
  });
});

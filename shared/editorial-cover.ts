export interface EditorialCoverPosition {
  x: number;
  y: number;
}

export interface EditorialCoverPositions {
  coverImagePosition?: EditorialCoverPosition;
  coverImageMobilePosition?: EditorialCoverPosition;
  coverImageCardPosition?: EditorialCoverPosition;
  coverImageCardMobilePosition?: EditorialCoverPosition;
}
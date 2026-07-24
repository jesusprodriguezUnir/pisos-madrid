import type { Listing, ListingImage } from '../models/listing.model';

export function mergeListingImages(
  listings: readonly Listing[],
  images: readonly ListingImage[],
): readonly Listing[] {
  const imagesByListingId = new Map<string, ListingImage[]>();

  for (const image of images) {
    const existing = imagesByListingId.get(image.listingId) ?? [];
    existing.push(image);
    imagesByListingId.set(image.listingId, existing);
  }

  return listings.map((listing) => {
    const listingImages = imagesByListingId.get(listing.id) ?? [];
    const primaryImage = listingImages.find((image) => image.isPrimary) ?? listingImages[0];

    if (primaryImage?.imageUrl && !listing.imageUrl) {
      return { ...listing, imageUrl: primaryImage.imageUrl };
    }

    return listing;
  });
}

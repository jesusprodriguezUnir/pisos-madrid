import { describe, expect, it } from 'vitest';
import type { Listing, ListingImage } from '../models/listing.model';
import { mergeListingImages } from './listing-images';

const baseListing: Listing = {
  id: 'listing-1',
  zone: 'Argüelles',
  operation: 'venta',
  type: 'Piso',
  address: 'Calle de la Luna',
  price: 320000,
  rooms: 3,
  area: 90,
  floor: 'Planta 3ª exterior con ascensor',
  url: 'https://example.com/listing-1',
};

describe('mergeListingImages', () => {
  it('usa la imagen principal de la colección de imágenes cuando existe', () => {
    const images: readonly ListingImage[] = [
      {
        id: 'img-1',
        listingId: 'listing-1',
        imageUrl: 'https://cdn.example.com/primary.jpg',
        isPrimary: true,
        createdAt: '2026-07-24T10:00:00.000Z',
      },
      {
        id: 'img-2',
        listingId: 'listing-1',
        imageUrl: 'https://cdn.example.com/secondary.jpg',
        isPrimary: false,
        createdAt: '2026-07-24T10:05:00.000Z',
      },
    ];

    const result = mergeListingImages([baseListing], images);

    expect(result[0].imageUrl).toBe('https://cdn.example.com/primary.jpg');
  });

  it('mantiene la imagen existente del inmueble si no hay imagen principal asociada', () => {
    const images: readonly ListingImage[] = [
      {
        id: 'img-3',
        listingId: 'listing-2',
        imageUrl: 'https://cdn.example.com/other.jpg',
        isPrimary: true,
        createdAt: '2026-07-24T11:00:00.000Z',
      },
    ];

    const listingWithCover: Listing = {
      ...baseListing,
      id: 'listing-3',
      imageUrl: 'https://cdn.example.com/local-cover.jpg',
    };

    const result = mergeListingImages([listingWithCover], images);

    expect(result[0].imageUrl).toBe('https://cdn.example.com/local-cover.jpg');
  });
});

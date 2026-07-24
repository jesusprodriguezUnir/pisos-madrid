import { describe, expect, it } from 'vitest';
import { buildListingFromForm } from './listing-form';

describe('buildListingFromForm', () => {
  it('preserva la portada del inmueble y usa un id de respaldo cuando falta', () => {
    const listing = buildListingFromForm(
      {
        url: 'https://www.idealista.com/inmueble/12345678/',
        source: 'idealista',
        zone: 'Argüelles',
        operation: 'venta',
        type: 'Piso',
        address: 'Calle de la Luna',
        price: 320000,
        rooms: 3,
        area: 90,
        floor: 'Planta 3ª exterior con ascensor',
        imageUrl: 'https://cdn.example.com/cover.jpg',
      },
      'manual_123',
    );

    expect(listing.id).toBe('manual_123');
    expect(listing.address).toBe('Calle de la Luna');
    expect(listing.imageUrl).toBe('https://cdn.example.com/cover.jpg');
  });

  it('omite la portada cuando no se proporciona URL', () => {
    const listing = buildListingFromForm(
      {
        url: '',
        source: 'fotocasa',
        zone: 'Chamartín',
        operation: 'alquiler',
        type: 'Ático',
        address: 'Avenida del Sol',
        price: 1800,
        rooms: 2,
        area: 70,
        floor: 'Planta 6ª',
        imageUrl: '   ',
      },
      'manual_456',
    );

    expect(listing.imageUrl).toBeUndefined();
  });
});

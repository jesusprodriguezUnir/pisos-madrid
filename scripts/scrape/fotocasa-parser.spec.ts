import { describe, expect, it } from 'vitest';
import { extractFotocasaId, parseFotocasaCards, type RawFotocasaCard } from './fotocasa-parser';

function card(overrides: Partial<RawFotocasaCard> = {}): RawFotocasaCard {
  return {
    href: '/es/comprar/vivienda/madrid-capital/arguelles/157057420/d',
    title: 'Piso en Calle de Alberto Aguilera, Argüelles, Madrid Capital',
    text: 'Piso en Calle de Alberto Aguilera 490.000€ 3 hab. 90 m² 2ª planta exterior con ascensor',
    ...overrides,
  };
}

describe('extractFotocasaId', () => {
  it('extrae el id numérico de una URL de detalle', () => {
    expect(extractFotocasaId('/es/comprar/vivienda/madrid-capital/arguelles/157057420/d')).toBe(
      '157057420',
    );
  });

  it('extrae el id numérico de URLs con o sin sufijo /d o con parámetros', () => {
    expect(extractFotocasaId('/es/comprar/vivienda/madrid-capital/arguelles/157057420')).toBe(
      '157057420',
    );
    expect(extractFotocasaId('/es/comprar/vivienda/madrid-capital/arguelles/157057420?from=list')).toBe(
      '157057420',
    );
  });

  it('devuelve null si el href no es una ficha de detalle', () => {
    expect(extractFotocasaId('/es/comprar/viviendas/madrid-capital/arguelles/l')).toBeNull();
  });
});

describe('parseFotocasaCards', () => {
  it('mapea una tarjeta completa al modelo de dominio', () => {
    const [listing] = parseFotocasaCards([card()], 'Argüelles', 'venta');

    expect(listing).toMatchObject({
      id: '157057420',
      zone: 'Argüelles',
      operation: 'venta',
      type: 'Piso',
      address: 'Calle de Alberto Aguilera, Argüelles',
      price: 490_000,
      rooms: 3,
      area: 90,
      source: 'fotocasa',
    });
    expect(listing.url).toContain('157057420');
  });

  it('soporta variaciones de texto como "dorm." o "dormitorios"', () => {
    const dormCard = card({
      href: '/es/comprar/vivienda/madrid-capital/arguelles/157057421/d',
      text: 'Piso en Argüelles € 420.000 2 dorm. 75 m² 3ª planta',
    });
    const [listing] = parseFotocasaCards([dormCard], 'Argüelles', 'venta');
    expect(listing).toMatchObject({
      id: '157057421',
      rooms: 2,
      area: 75,
      price: 420_000,
    });
  });

  it('descarta tarjetas por debajo de los mínimos de habitaciones o superficie', () => {
    const small = card({
      href: '/es/comprar/vivienda/madrid-capital/arguelles/1/d',
      text: 'Estudio 200.000€ 1 hab. 40 m²',
    });
    expect(parseFotocasaCards([small], 'Argüelles', 'venta')).toEqual([]);
  });

  it('descarta tarjetas por encima del techo de precio de la operación', () => {
    const pricey = card({
      href: '/es/comprar/vivienda/madrid-capital/arguelles/2/d',
      text: 'Piso 900.000€ 3 hab. 100 m²',
    });
    expect(parseFotocasaCards([pricey], 'Argüelles', 'venta')).toEqual([]);
  });

  it('ignora tarjetas sin id de vivienda extraíble', () => {
    const broken = card({ href: '/es/comprar/viviendas/madrid-capital/arguelles/l' });
    expect(parseFotocasaCards([broken], 'Argüelles', 'venta')).toEqual([]);
  });

  it('deduplica por id dentro del mismo lote de tarjetas', () => {
    const duplicated = [card(), card()];
    expect(parseFotocasaCards(duplicated, 'Argüelles', 'venta')).toHaveLength(1);
  });

  it('incluye imageUrl si la tarjeta cruda la contiene', () => {
    const cardWithImg = card({
      href: '/es/comprar/vivienda/madrid-capital/arguelles/157057499/d',
      imageUrl: 'https://fotocasa.es/img.jpg',
    });
    const [listing] = parseFotocasaCards([cardWithImg], 'Argüelles', 'venta');
    expect(listing.imageUrl).toBe('https://fotocasa.es/img.jpg');
  });

  it('extrae características adicionales de terraza y piscina presentes en el texto', () => {
    const featureCard = card({
      href: '/es/comprar/vivienda/madrid-capital/arguelles/157057500/d',
      text: 'Piso 450.000€ 3 hab. 85 m² Planta 1ª exterior con terraza con piscina',
    });
    const [listing] = parseFotocasaCards([featureCard], 'Argüelles', 'venta');
    expect(listing.floor).toContain('con terraza');
    expect(listing.floor).toContain('con piscina');
  });
});

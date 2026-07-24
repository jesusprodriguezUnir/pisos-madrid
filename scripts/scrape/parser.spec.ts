import { describe, expect, it } from 'vitest';
import { buildIdealistaUrl } from './config';
import { extractId, parseListingsPage, splitTitle, toInt } from './parser';

function article(options: {
  href: string;
  title: string;
  price: string;
  details: readonly string[];
}): string {
  const details = options.details.map((d) => `<span class="item-detail">${d}</span>`).join('');
  return `
    <article class="item">
      <a class="item-link" href="${options.href}">${options.title}</a>
      <span class="item-price">${options.price}</span>
      <div class="item-detail-char">${details}</div>
    </article>`;
}

const validArticle = article({
  href: '/inmueble/112009758/',
  title: 'Piso en Calle de Maudes, Nuevos Ministerios-Ríos Rosas, Madrid',
  price: '490.000€',
  details: ['2 hab.', '69 m²', 'Entreplanta exterior con ascensor'],
});

describe('toInt', () => {
  it('ignora separadores de millar y símbolos', () => {
    expect(toInt('1.250.000 €')).toBe(1_250_000);
    expect(toInt('69 m²')).toBe(69);
  });

  it('devuelve 0 para entradas vacías o sin dígitos', () => {
    expect(toInt(undefined)).toBe(0);
    expect(toInt('sin precio')).toBe(0);
  });
});

describe('extractId', () => {
  it('extrae el identificador de la URL del anuncio', () => {
    expect(extractId('/inmueble/112009758/')).toBe('112009758');
  });

  it('devuelve null si la URL no es de un inmueble', () => {
    expect(extractId('/venta-viviendas/madrid/chamberi/')).toBeNull();
  });
});

describe('splitTitle', () => {
  it('separa tipo y dirección y elimina el sufijo Madrid', () => {
    expect(splitTitle('Ático en Calle del Salitre, Lavapiés-Embajadores, Madrid')).toEqual({
      type: 'Ático',
      address: 'Calle del Salitre, Lavapiés-Embajadores',
    });
  });

  it('tolera títulos sin calle', () => {
    expect(splitTitle('Piso en Trafalgar, Madrid')).toEqual({
      type: 'Piso',
      address: 'Trafalgar',
    });
  });
});

describe('parseListingsPage', () => {
  it('mapea un anuncio completo al modelo de dominio', () => {
    const [listing] = parseListingsPage(validArticle, 'Chamberí', 'venta');

    expect(listing).toEqual({
      id: '112009758',
      zone: 'Chamberí',
      operation: 'venta',
      type: 'Piso',
      address: 'Calle de Maudes, Nuevos Ministerios-Ríos Rosas',
      price: 490_000,
      rooms: 2,
      area: 69,
      floor: 'Entreplanta exterior con ascensor',
      url: 'https://www.idealista.com/inmueble/112009758/',
      source: 'idealista',
    });
  });

  it('preserva tags de detalles como ascensor, terraza y piscina en el campo floor', () => {
    const multiDetailArticle = article({
      href: '/inmueble/99999/',
      title: 'Piso en Calle de Alberto Aguilera, Madrid',
      price: '500.000€',
      details: ['3 hab.', '90 m²', 'Planta 3ª exterior', 'con ascensor', 'con terraza', 'piscina'],
    });

    const [listing] = parseListingsPage(multiDetailArticle, 'Chamberí', 'venta');
    expect(listing.floor).toBe('Planta 3ª exterior con ascensor con terraza piscina');
  });

  it('descarta anuncios por debajo de los mínimos de habitaciones o superficie', () => {
    const small = article({
      href: '/inmueble/1/',
      title: 'Estudio en Calle Corta, Madrid',
      price: '200.000€',
      details: ['1 hab.', '40 m²', 'Bajo interior'],
    });
    expect(parseListingsPage(small, 'Chamberí', 'venta')).toEqual([]);
  });

  it('descarta anuncios por encima del techo de precio de la operación', () => {
    const pricey = article({
      href: '/inmueble/2/',
      title: 'Piso en Calle Cara, Madrid',
      price: '900.000€',
      details: ['3 hab.', '100 m²', '2ª planta exterior con ascensor'],
    });
    expect(parseListingsPage(pricey, 'Chamberí', 'venta')).toEqual([]);
  });

  it('aplica el techo de alquiler, no el de venta', () => {
    const rent = article({
      href: '/inmueble/3/',
      title: 'Piso en Calle Alquilada, Madrid',
      price: '1.500€/mes',
      details: ['2 hab.', '70 m²', '1ª planta exterior con ascensor'],
    });
    expect(parseListingsPage(rent, 'Chamberí', 'alquiler')).toHaveLength(1);
    // el mismo precio interpretado como venta también entra, pero 2.000 €/mes no
    const expensiveRent = rent.replace('1.500€/mes', '2.000€/mes');
    expect(parseListingsPage(expensiveRent, 'Chamberí', 'alquiler')).toEqual([]);
  });

  it('ignora artículos sin enlace o sin id de inmueble', () => {
    const broken = '<article class="item"><span class="item-price">100.000€</span></article>';
    expect(parseListingsPage(broken, 'Chamberí', 'venta')).toEqual([]);
  });

  it('devuelve lista vacía ante HTML sin resultados', () => {
    expect(parseListingsPage('<main><p>Sin resultados</p></main>', 'Chamberí', 'venta')).toEqual(
      [],
    );
  });

  it('extrae imageUrl si el artículo contiene una imagen', () => {
    const htmlWithImg = `
      <article class="item">
        <a class="item-link" href="/inmueble/112009759/">Piso en Calle de Maudes, Madrid</a>
        <span class="item-price">400.000€</span>
        <div class="item-detail-char">
          <span class="item-detail">2 hab.</span>
          <span class="item-detail">70 m²</span>
        </div>
        <img data-ondemand-img="https://img3.idealista.com/blur/WEB_DETAIL/0/id.jpg" />
      </article>`;
    const [listing] = parseListingsPage(htmlWithImg, 'Chamberí', 'venta');
    expect(listing.imageUrl).toBe('https://img3.idealista.com/blur/WEB_DETAIL/0/id.jpg');
  });
});

describe('buildIdealistaUrl', () => {
  const zone = { name: 'Chamberí', slug: 'chamberi', idealista: 'madrid/chamberi', fotocasa: 'chamberi' };

  it('construye la URL de la primera página sin sufijo de paginación', () => {
    expect(buildIdealistaUrl(zone, 'venta', 1)).toBe(
      'https://www.idealista.com/venta-viviendas/madrid/chamberi/' +
        'con-precio-hasta_550000,metros-cuadrados-mas-de_60,' +
        'de-dos-dormitorios,de-tres-dormitorios,de-cuatro-cinco-habitaciones-o-mas/',
    );
  });

  it('añade el sufijo pagina-N.htm a partir de la segunda', () => {
    expect(buildIdealistaUrl(zone, 'alquiler', 3)).toContain('/pagina-3.htm');
    expect(buildIdealistaUrl(zone, 'alquiler', 3)).toContain('alquiler-viviendas');
    expect(buildIdealistaUrl(zone, 'alquiler', 3)).toContain('con-precio-hasta_1800');
  });
});

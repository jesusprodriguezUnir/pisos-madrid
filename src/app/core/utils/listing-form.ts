import type { Listing, Operation, Source } from '../models/listing.model';

export interface ListingFormValues {
  readonly id?: string;
  readonly url: string;
  readonly source: Source;
  readonly zone: string;
  readonly operation: Operation;
  readonly type: string;
  readonly address: string;
  readonly price: number | null;
  readonly rooms: number | null;
  readonly area: number | null;
  readonly floor: string;
  readonly imageUrl: string;
}

export function buildListingFromForm(form: ListingFormValues, fallbackId: string): Listing {
  const id = (form.id ?? '').trim() || fallbackId;

  return {
    id,
    zone: form.zone,
    operation: form.operation,
    type: form.type || 'Piso',
    address: form.address.trim(),
    price: Number(form.price),
    rooms: Number(form.rooms),
    area: Number(form.area),
    floor: form.floor.trim(),
    url: form.url.trim() || `https://www.idealista.com/inmueble/${id}/`,
    source: form.source,
    ...(form.imageUrl.trim() ? { imageUrl: form.imageUrl.trim() } : {}),
  };
}

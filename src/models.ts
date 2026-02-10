export enum TripStatus {
  Created = 'CREATED',
  Packing = 'PACKING',
  Packed = 'PACKED',
  Returned = 'RETURNED',
  Complete = 'COMPLETE',
  Unknown = 'UNKNOWN',
}

export interface FetchTripResponse {
  trip: Trip;
  items: TripItem[];
  returnedItems: ReturnedItems;
}

export type Trip = {
  tripId: number;
  name: string;
  startDate: string;
  endDate: string;
  countryCode: string;
  status?: TripStatus;
};

export interface TripItem {
  upc: string;
  boxNumber: number;
  quantity: number;
  expirationDate: string;
  lotNumber: string;
  inventoryId: number;
  name: string;
  brand: string;
  manufacturer: string;
  manufacturedDate?: string;
  presentation: string;
  dose: string;
  category: string;
  productAmount: number;
  productAmountUnit: string;
  partialAmount?: number,
  partialamountUnit?: string
}

export interface ReturnedItem {
  name: string;
  upc: string;
  lotNumber: string;
  expirationDate: string;
  inventoryId: number;
  returnedQuantity: number;
  returnedProductAmount: number;
  originalProductAmount: number;
  productAmountUnit: string;
  beingRelabeled: boolean;
}

export interface ReturnedItems {
  fulls: ReturnedItem[];
  partials: ReturnedItem[];
}